package persistence

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"postcode/backend/internal/domain"
)

// enqueueCallNotification writes an outbox record inside the active CallNext transaction.
// Any error is non-fatal to the queue transaction and is returned for logging.
func (p *Postgres) enqueueCallNotification(ctx context.Context, tx pgx.Tx, t domain.Ticket) error {
	winNumber := 0
	if t.Window != nil {
		winNumber = t.Window.Number
	}

	var outboxID string
	err := tx.QueryRow(ctx, `
		INSERT INTO notification_outbox (ticket_id, branch_id, event_type, payload, status, next_attempt_at, created_at)
		VALUES ($1::uuid, $2::uuid, $3, '{}'::jsonb, 'PENDING', clock_timestamp(), clock_timestamp())
		RETURNING id::text
	`, t.ID, t.BranchID, string(domain.NotificationTicketCalled)).Scan(&outboxID)
	if err != nil {
		return dbError(err)
	}

	msg := domain.NotificationMessage{
		ID:           outboxID,
		TicketID:     t.ID,
		BranchID:     t.BranchID,
		PublicNumber: t.PublicNumber,
		WindowNumber: winNumber,
		EventType:    domain.NotificationTicketCalled,
		CreatedAt:    time.Now().UTC(),
	}

	payload, err := json.Marshal(msg)
	if err != nil {
		return fmt.Errorf("marshal outbox payload: %w", err)
	}

	_, err = tx.Exec(ctx, `UPDATE notification_outbox SET payload=$1::jsonb WHERE id=$2::uuid`, payload, outboxID)
	if err != nil {
		return dbError(err)
	}
	return nil
}

// FetchPendingNotifications atomically claims unassigned/due outbox items with a lease.
func (p *Postgres) FetchPendingNotifications(ctx context.Context, limit int, now time.Time) ([]domain.NotificationOutboxItem, error) {
	if limit <= 0 {
		limit = 10
	}

	rows, err := p.pool.Query(ctx, `
		WITH claimable AS (
			SELECT id
			FROM notification_outbox
			WHERE status = 'PENDING' AND next_attempt_at <= $1::timestamptz
			ORDER BY next_attempt_at ASC, id ASC
			LIMIT $2
			FOR UPDATE SKIP LOCKED
		)
		UPDATE notification_outbox o
		SET next_attempt_at = $1::timestamptz + interval '30 seconds'
		FROM claimable
		WHERE o.id = claimable.id
		RETURNING o.id::text, o.ticket_id::text, o.branch_id::text, o.event_type, o.payload::text,
		          o.status, o.attempts, o.max_attempts, o.next_attempt_at, o.created_at, o.sent_at, o.last_error
	`, now, limit)
	if err != nil {
		return nil, dbError(err)
	}
	defer rows.Close()

	var items []domain.NotificationOutboxItem
	for rows.Next() {
		var item domain.NotificationOutboxItem
		var evType string
		var status string
		var sentAt *time.Time
		var lastErr *string

		if err := rows.Scan(
			&item.ID,
			&item.TicketID,
			&item.BranchID,
			&evType,
			&item.Payload,
			&status,
			&item.Attempts,
			&item.MaxAttempts,
			&item.NextAttemptAt,
			&item.CreatedAt,
			&sentAt,
			&lastErr,
		); err != nil {
			return nil, dbError(err)
		}
		item.EventType = domain.NotificationEventType(evType)
		item.Status = domain.NotificationStatus(status)
		item.SentAt = sentAt
		item.LastError = lastErr
		items = append(items, item)
	}
	return items, nil
}

// MarkNotificationSent records successful delivery.
func (p *Postgres) MarkNotificationSent(ctx context.Context, id string, sentAt time.Time) error {
	_, err := p.pool.Exec(ctx, `
		UPDATE notification_outbox
		SET status = 'SENT', sent_at = $1::timestamptz, attempts = attempts + 1
		WHERE id = $2::uuid
	`, sentAt, id)
	if err != nil {
		return dbError(err)
	}
	return nil
}

// MarkNotificationFailed records transient or permanent delivery failure.
func (p *Postgres) MarkNotificationFailed(ctx context.Context, id string, errStr string, nextAttempt time.Time, final bool) error {
	newStatus := "PENDING"
	if final {
		newStatus = "FAILED"
	}
	_, err := p.pool.Exec(ctx, `
		UPDATE notification_outbox
		SET status = $1, attempts = attempts + 1, last_error = $2, next_attempt_at = $3::timestamptz
		WHERE id = $4::uuid
	`, newStatus, errStr, nextAttempt, id)
	if err != nil {
		return dbError(err)
	}
	return nil
}

// ListNotificationOutbox provides read access to the outbox for monitoring and debug endpoints.
func (p *Postgres) ListNotificationOutbox(ctx context.Context, limit, offset int, status string) ([]domain.NotificationOutboxItem, int, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}

	whereClause := "WHERE 1=1"
	args := []any{}
	if status != "" {
		args = append(args, status)
		whereClause += fmt.Sprintf(" AND status = $%d", len(args))
	}

	var total int
	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM notification_outbox %s", whereClause)
	if err := p.pool.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, dbError(err)
	}

	args = append(args, limit, offset)
	selectQuery := fmt.Sprintf(`
		SELECT id::text, ticket_id::text, branch_id::text, event_type, payload::text,
		       status, attempts, max_attempts, next_attempt_at, created_at, sent_at, last_error
		FROM notification_outbox
		%s
		ORDER BY created_at DESC, id DESC
		LIMIT $%d OFFSET $%d
	`, whereClause, len(args)-1, len(args))

	rows, err := p.pool.Query(ctx, selectQuery, args...)
	if err != nil {
		return nil, 0, dbError(err)
	}
	defer rows.Close()

	var items []domain.NotificationOutboxItem
	for rows.Next() {
		var item domain.NotificationOutboxItem
		var evType string
		var stat string
		var sentAt *time.Time
		var lastErr *string

		if err := rows.Scan(
			&item.ID,
			&item.TicketID,
			&item.BranchID,
			&evType,
			&item.Payload,
			&stat,
			&item.Attempts,
			&item.MaxAttempts,
			&item.NextAttemptAt,
			&item.CreatedAt,
			&sentAt,
			&lastErr,
		); err != nil {
			return nil, 0, dbError(err)
		}
		item.EventType = domain.NotificationEventType(evType)
		item.Status = domain.NotificationStatus(stat)
		item.SentAt = sentAt
		item.LastError = lastErr
		items = append(items, item)
	}
	return items, total, nil
}

// enqueueNearTurnForTopCandidates finds top waiting tickets that have reached position <= 2 and enqueues near-turn notifications.
func (p *Postgres) enqueueNearTurnForTopCandidates(ctx context.Context, tx pgx.Tx, branch string, decisionTime time.Time) error {
	rows, err := tx.Query(ctx, `
		SELECT t.id::text, t.branch_id::text, t.public_number
		FROM tickets t
		WHERE t.branch_id = $1::uuid
		  AND (t.status = 'WAITING' OR (t.source = 'APPOINTMENT' AND t.status = 'SCHEDULED'))
		  AND t.ready_at <= $2::timestamptz
		  AND NOT EXISTS (
		      SELECT 1 FROM notification_outbox no
		      WHERE no.ticket_id = t.id AND no.event_type = 'TICKET_NEAR_TURN'
		  )
		ORDER BY t.due_at ASC, t.source_rank ASC, t.checkin_at ASC, t.id ASC
		LIMIT 2
		FOR SHARE OF t SKIP LOCKED
	`, branch, decisionTime)
	if err != nil {
		return err
	}
	defer rows.Close()

	type candInfo struct {
		id, branchID, publicNum string
	}
	var cands []candInfo
	for rows.Next() {
		var c candInfo
		if err := rows.Scan(&c.id, &c.branchID, &c.publicNum); err == nil {
			cands = append(cands, c)
		}
	}
	rows.Close()

	for _, c := range cands {
		var outboxID string
		err := tx.QueryRow(ctx, `
			INSERT INTO notification_outbox (ticket_id, branch_id, event_type, payload, status, next_attempt_at, created_at)
			VALUES ($1::uuid, $2::uuid, $3, '{}'::jsonb, 'PENDING', clock_timestamp(), clock_timestamp())
			RETURNING id::text
		`, c.id, c.branchID, string(domain.NotificationTicketNearTurn)).Scan(&outboxID)
		if err != nil {
			continue
		}

		msg := domain.NotificationMessage{
			ID:           outboxID,
			TicketID:     c.id,
			BranchID:     c.branchID,
			PublicNumber: c.publicNum,
			WindowNumber: 0,
			EventType:    domain.NotificationTicketNearTurn,
			CreatedAt:    time.Now().UTC(),
		}
		if payload, pErr := json.Marshal(msg); pErr == nil {
			_, _ = tx.Exec(ctx, `UPDATE notification_outbox SET payload=$1::jsonb WHERE id=$2::uuid`, payload, outboxID)
		}
	}
	return nil
}

// EnqueueNearTurnIfEligible idempotently enqueues a TICKET_NEAR_TURN notification if eligible.
func (p *Postgres) EnqueueNearTurnIfEligible(ctx context.Context, ticketID string) error {
	tID, err := uuid(ticketID)
	if err != nil {
		return err
	}

	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return dbError(err)
	}
	defer tx.Rollback(ctx)

	// 1. Fetch ticket to verify status and get public_number, branch_id
	var tIDStr, branchID, publicNum string
	var status domain.TicketStatus
	err = tx.QueryRow(ctx, `
		SELECT id::text, branch_id::text, status, public_number
		FROM tickets WHERE id = $1
	`, tID).Scan(&tIDStr, &branchID, &status, &publicNum)
	if err != nil {
		return dbError(err)
	}

	if status != domain.TicketStatusWaiting && status != domain.TicketStatusScheduled {
		return nil
	}

	// 2. Atomically check and insert if not already enqueued
	var alreadyExists bool
	err = tx.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM notification_outbox
			WHERE ticket_id = $1::uuid AND event_type = $2
		)
	`, tID, string(domain.NotificationTicketNearTurn)).Scan(&alreadyExists)
	if err != nil {
		return dbError(err)
	}
	if alreadyExists {
		return nil
	}

	var outboxID string
	err = tx.QueryRow(ctx, `
		INSERT INTO notification_outbox (ticket_id, branch_id, event_type, payload, status, next_attempt_at, created_at)
		VALUES ($1::uuid, $2::uuid, $3, '{}'::jsonb, 'PENDING', clock_timestamp(), clock_timestamp())
		RETURNING id::text
	`, tID, branchID, string(domain.NotificationTicketNearTurn)).Scan(&outboxID)
	if err != nil {
		return dbError(err)
	}

	msg := domain.NotificationMessage{
		ID:           outboxID,
		TicketID:     tIDStr,
		BranchID:     branchID,
		PublicNumber: publicNum,
		WindowNumber: 0,
		EventType:    domain.NotificationTicketNearTurn,
		CreatedAt:    time.Now().UTC(),
	}
	payload, err := json.Marshal(msg)
	if err != nil {
		return fmt.Errorf("marshal near-turn payload: %w", err)
	}

	_, err = tx.Exec(ctx, `UPDATE notification_outbox SET payload=$1::jsonb WHERE id=$2::uuid`, payload, outboxID)
	if err != nil {
		return dbError(err)
	}

	return tx.Commit(ctx)
}
