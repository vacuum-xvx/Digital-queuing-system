package persistence

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"postcode/backend/internal/domain"
)

// The single eligibility/arithmetic primitive used by both claim and position.
// Parameters: window, branch, authoritative time, then the eight policy values.
// Extracted seconds are floored before casting; every multiplicand is BIGINT.
// LATERAL expressions stay attached to the base row (t), which CallNext locks.
const rankedCandidates = `SELECT t.id,t.status,q.effective_queue_time,
 greatest(0::bigint,b.base_priority-l.lateness_penalty)
 + greatest(0::bigint,s.waiting_seconds-$7::bigint*60)*$8::bigint/60 AS effective_priority
 FROM tickets t
 CROSS JOIN LATERAL (SELECT CASE WHEN t.source='APPOINTMENT'
 THEN greatest(t.scheduled_at,coalesce(t.arrived_at,t.scheduled_at))
 ELSE t.queue_entered_at END AS effective_queue_time) q
 CROSS JOIN LATERAL (SELECT CASE t.source WHEN 'APPOINTMENT' THEN $4::bigint
 WHEN 'QR' THEN $5::bigint ELSE $6::bigint END AS base_priority) b
 CROSS JOIN LATERAL (SELECT greatest(0::bigint,floor(extract(epoch FROM ($3::timestamptz-q.effective_queue_time)))::bigint) AS waiting_seconds,
 CASE WHEN t.source='APPOINTMENT' THEN greatest(0::bigint,
 floor(extract(epoch FROM (coalesce(t.arrived_at,t.scheduled_at)-t.scheduled_at)))::bigint)
 ELSE 0::bigint END AS raw_lateness_seconds) s
 CROSS JOIN LATERAL (SELECT CASE WHEN t.source='APPOINTMENT' THEN
 least(greatest(0::bigint,s.raw_lateness_seconds-$9::bigint*60)*$10::bigint/60,$11::bigint)
 ELSE 0::bigint END AS lateness_penalty) l
 WHERE t.branch_id=$2::uuid
 AND ((t.source IN ('QR','LIVE') AND t.status='WAITING') OR
 (t.source='APPOINTMENT' AND t.status='SCHEDULED' AND (t.scheduled_at<=$3::timestamptz + INTERVAL '15 minutes' OR t.arrived_at IS NOT NULL)))
 AND (t.window_id IS NULL OR t.window_id=$1::uuid)
 AND EXISTS(SELECT 1 FROM window_services ws WHERE ws.window_id=$1::uuid AND ws.service_id=t.service_id)`
const rankingOrder = `effective_priority DESC,effective_queue_time ASC,id ASC`
const canonicalOrder = ` ORDER BY ` + rankingOrder

func rankingArgs(window, branch string, at time.Time, p domain.QueuePolicy) []any {
	return []any{window, branch, at, int64(p.AppointmentDuePriority), int64(p.QRPriority), int64(p.LivePriority),
		int64(p.AntiStarvationThresholdMinutes), int64(p.AntiStarvationPointsPerMinute), int64(p.AppointmentGraceMinutes),
		int64(p.AppointmentLatePenaltyPerMinute), int64(p.AppointmentLatePenaltyMaxPoints)}
}

func (p *Postgres) GetQueuePosition(ctx context.Context, ticketID string) (domain.QueuePosition, error) {
	var out domain.QueuePosition
	_, err := uuid(ticketID)
	if err != nil {
		return out, err
	}
	tx, err := p.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return out, dbError(err)
	}
	defer tx.Rollback(context.Background())
	return queuePosition(ctx, tx, ticketID)
}

// queuePosition is shared by QueuePosition and ETA in a read-only snapshot.
func queuePosition(ctx context.Context, tx pgx.Tx, ticketID string) (domain.QueuePosition, error) {
	var out domain.QueuePosition
	var err error
	// Establish the snapshot and its one authoritative time before any reads.
	if err = tx.QueryRow(ctx, `SELECT transaction_timestamp()`).Scan(&out.CalculatedAt); err != nil {
		return out, dbError(err)
	}
	out.CalculatedAt = out.CalculatedAt.UTC()
	t, err := scanTicket(tx.QueryRow(ctx, ticketSelect+`WHERE t.id=$1`, ticketID))
	if err != nil {
		return out, err
	}
	out.TicketID = t.ID
	out.TicketStatus = t.Status
	out.Reason = domain.QueuePositionNotQueued
	if t.Status != domain.TicketStatusWaiting && t.Status != domain.TicketStatusScheduled {
		return out, nil
	}
	if t.Source == domain.TicketSourceAppointment && t.ArrivedAt == nil {
		if t.ScheduledAt != nil && t.ScheduledAt.After(out.CalculatedAt.Add(15*time.Minute)) {
			out.Reason = domain.QueuePositionNotEligibleYet
			return out, nil
		}
		if t.ReadyAt != nil && t.ReadyAt.After(out.CalculatedAt) {
			out.Reason = domain.QueuePositionNotEligibleYet
			return out, nil
		}
	} else if t.ReadyAt != nil && t.ReadyAt.After(out.CalculatedAt) {
		out.Reason = domain.QueuePositionNotEligibleYet
		return out, nil
	}
	var targetWindowID *string
	if t.Window != nil {
		targetWindowID = &t.Window.ID
	}
	var w domain.WindowRef
	err = tx.QueryRow(ctx, `SELECT w.id::text,w.number FROM windows w
 WHERE w.branch_id=$1::uuid AND w.status='OPEN'
 AND EXISTS(SELECT 1 FROM window_services ws WHERE ws.window_id=w.id AND ws.service_id=$2::uuid)
 AND ($3::uuid IS NULL OR w.id=$3::uuid)
 ORDER BY w.number,w.id LIMIT 1`, t.BranchID, t.ServiceID, targetWindowID).Scan(&w.ID, &w.Number)
	if errors.Is(err, pgx.ErrNoRows) {
		out.Reason = domain.QueuePositionNoOpenCompatibleWindow
		return out, nil
	}
	if err != nil {
		return out, dbError(err)
	}

	dueAt := time.Now()
	if t.DueAt != nil {
		dueAt = *t.DueAt
	} else if t.ScheduledAt != nil {
		dueAt = *t.ScheduledAt
	}
	checkinAt := t.QueueEnteredAt
	if t.CheckinAt != nil {
		checkinAt = *t.CheckinAt
	} else if t.ArrivedAt != nil {
		checkinAt = *t.ArrivedAt
	}

	var rank int
	err = tx.QueryRow(ctx, `
		SELECT count(*) + 1
		FROM tickets c
		WHERE c.branch_id = $1::uuid
		  AND (c.status = 'WAITING' OR (c.source = 'APPOINTMENT' AND c.status = 'SCHEDULED'))
		  AND (c.window_id IS NULL OR c.window_id = $2::uuid)
		  AND EXISTS (SELECT 1 FROM window_services ws WHERE ws.window_id = $2::uuid AND ws.service_id = c.service_id)
		  AND c.ready_at <= $3::timestamptz
		  AND (c.due_at, c.source_rank, c.checkin_at, c.id) < ($4::timestamptz, $5::int, $6::timestamptz, $7::uuid)
	`, t.BranchID, w.ID, out.CalculatedAt, dueAt, t.SourceRank, checkinAt, t.ID).Scan(&rank)
	if err != nil {
		return out, dbError(err)
	}

	out.Position = &rank

	var prio int64 = int64(t.SourceRank)
	if legacyPolicy, pErr := scanPolicy(tx.QueryRow(ctx, policySelect+` WHERE branch_id=$1::uuid`, t.BranchID)); pErr == nil {
		if t.Source == domain.TicketSourceAppointment {
			prio = int64(legacyPolicy.AppointmentDuePriority)
		} else if t.Source == domain.TicketSourceQR {
			prio = int64(legacyPolicy.QRPriority)
		} else {
			prio = int64(legacyPolicy.LivePriority)
		}
	}
	out.EffectivePriority = &prio

	eqt := checkinAt.UTC()
	out.EffectiveQueueTime = &eqt
	out.Reason = domain.QueuePositionAvailable
	out.ReferenceWindow = &w
	return out, nil
}
