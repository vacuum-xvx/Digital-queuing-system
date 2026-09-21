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

	msg := domain.NotificationMessage{
		ID:           t.ID + "-call",
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

	_, err = tx.Exec(ctx, `
		INSERT INTO notification_outbox (ticket_id, branch_id, event_type, payload, status, next_attempt_at, created_at)
		VALUES ($1::uuid, $2::uuid, $3, $4::jsonb, 'PENDING', clock_timestamp(), clock_timestamp())
	`, t.ID, t.BranchID, string(domain.NotificationTicketCalled), payload)
	if err != nil {
		return dbError(err)
	}
	return nil
}

// FetchPendingNotifications queries unassigned/due outbox items with FOR UPDATE SKIP LOCKED.
func (p *Postgres) FetchPendingNotifications(ctx context.Context, limit int, now time.Time) ([]domain.NotificationOutboxItem, error) {
	if limit <= 0 {
		limit = 10
	}

	rows, err := p.pool.Query(ctx, `
		SELECT id::text, ticket_id::text, branch_id::text, event_type, payload::text,
		       status, attempts, max_attempts, next_attempt_at, created_at, sent_at, last_error
		FROM notification_outbox
		WHERE status = 'PENDING' AND next_attempt_at <= $1::timestamptz
		ORDER BY next_attempt_at ASC, id ASC
		LIMIT $2
		FOR UPDATE SKIP LOCKED
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
