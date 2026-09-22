package persistence

import (
	"context"
	"postcode/backend/internal/domain"
)

// GetOperatorQueue returns only the first 25 waiting tickets, not the full overview.
func (p *Postgres) GetOperatorQueue(ctx context.Context, branchID string) (domain.OperatorQueue, error) {
	result := domain.OperatorQueue{Items: make([]domain.AdminQueueTicket, 0, 25)}
	id, err := p.branch(ctx, branchID)
	if err != nil {
		return result, err
	}
	rows, err := p.pool.Query(ctx, `
		SELECT t.id::text, t.public_number, t.source, t.service_id::text,
		       s.name, t.queue_entered_at, t.status, COUNT(*) OVER ()
		FROM tickets t JOIN services s ON s.id = t.service_id
		WHERE t.branch_id = $1 AND (
			t.status = 'WAITING'
			OR (t.source = 'APPOINTMENT' AND t.status = 'SCHEDULED' AND (
				t.arrived_at IS NOT NULL
				OR t.scheduled_at <= clock_timestamp() + INTERVAL '15 minutes'
			))
		)
		ORDER BY t.due_at ASC, t.source_rank ASC, COALESCE(t.checkin_at, t.queue_entered_at) ASC, t.id ASC
		LIMIT 25
	`, id)
	if err != nil {
		return result, dbError(err)
	}
	defer rows.Close()
	for rows.Next() {
		var item domain.AdminQueueTicket
		if err := rows.Scan(&item.ID, &item.PublicNumber, &item.Source, &item.ServiceID,
			&item.ServiceName, &item.QueueEnteredAt, &item.Status, &result.Total); err != nil {
			return result, dbError(err)
		}
		result.Items = append(result.Items, item)
	}
	return result, dbError(rows.Err())
}
