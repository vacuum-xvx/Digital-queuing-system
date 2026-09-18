package persistence

import (
	"context"
	"math"
	"time"

	"github.com/jackc/pgx/v5"
	"postcode/backend/internal/domain"
)

// GetTicketETA observes the same ranking snapshot as QueuePosition. It never claims a ticket.
func (p *Postgres) GetTicketETA(ctx context.Context, ticketID string) (domain.TicketETA, error) {
	var out domain.TicketETA
	if _, err := uuid(ticketID); err != nil {
		return out, err
	}
	tx, err := p.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return out, dbError(err)
	}
	defer tx.Rollback(context.Background())
	position, err := queuePosition(ctx, tx, ticketID)
	if err != nil {
		return out, err
	}
	out = domain.TicketETA{TicketID: position.TicketID, TicketStatus: position.TicketStatus,
		Reason: position.Reason, Position: position.Position, ReferenceWindow: position.ReferenceWindow, CalculatedAt: position.CalculatedAt}
	if position.Reason != domain.QueuePositionAvailable {
		return out, nil
	}
	var average float64
	err = tx.QueryRow(ctx, `SELECT count(*),coalesce(floor(avg(seconds)),0) FROM (
 SELECT extract(epoch FROM (h.completed_at-h.service_started_at)) AS seconds
 FROM tickets h JOIN tickets t ON t.id=$1::uuid
 WHERE h.branch_id=t.branch_id AND h.service_id=t.service_id AND h.status='COMPLETED'
 AND h.completed_at>h.service_started_at
 ORDER BY h.completed_at DESC,h.id DESC LIMIT 20
 ) history`, ticketID).Scan(&out.SampleSize, &average)
	if err != nil {
		return out, dbError(err)
	}
	out.UsedFallback = out.SampleSize < 3
	if out.UsedFallback {
		average = 300
	}
	wait := etaWait(*position.Position, average)
	callAt := out.CalculatedAt.Add(time.Duration(wait) * time.Second)
	out.EstimatedWaitSeconds, out.EstimatedCallAt = &wait, &callAt
	return out, nil
}

func etaWait(position int, average float64) int {
	return int(math.Max(60, math.Min(1800, float64(max(position-1, 0))*average)))
}
