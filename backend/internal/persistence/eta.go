package persistence

import (
	"context"
	"math"
	"sort"
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
	var durations []float64
	err = tx.QueryRow(ctx, `SELECT count(*),coalesce(floor(avg(seconds)),0),coalesce(array_agg(seconds ORDER BY completed_at DESC, history_id DESC), ARRAY[]::double precision[]) FROM (
	SELECT h.id AS history_id, h.completed_at, extract(epoch FROM (h.completed_at-h.service_started_at))::double precision AS seconds
 FROM tickets h JOIN tickets t ON t.id=$1::uuid
 WHERE h.branch_id=t.branch_id AND h.service_id=t.service_id AND h.status='COMPLETED'
 AND h.completed_at>h.service_started_at
 ORDER BY h.completed_at DESC,h.id DESC LIMIT 20
	 ) history`, ticketID).Scan(&out.SampleSize, &average, &durations)
	if err != nil {
		return out, dbError(err)
	}
	out.UsedFallback = out.SampleSize < 3
	samples := make([]int, 0, len(durations))
	for _, duration := range durations { samples = append(samples, int(math.Floor(duration))) }
	weighted := weightedAverage(durations)
	median := percentile(durations, 0.5)
	p90 := percentile(durations, 0.9)
	if out.UsedFallback {
		weighted = 300
	}
	out.Distribution = &domain.ETADistribution{Avg: int(math.Floor(average)), WeightedAvg: int(math.Floor(weighted)), Median: int(math.Floor(median)), P90: int(math.Floor(p90)), Samples: samples}
	out.WeightedWaitSeconds = intPtr(int(math.Floor(weighted)))
	out.MedianSeconds = intPtr(int(math.Floor(median)))
	out.P90WaitSeconds = intPtr(int(math.Floor(p90)))
	wait := etaWait(*position.Position, weighted)
	callAt := out.CalculatedAt.Add(time.Duration(wait) * time.Second)
	out.EstimatedWaitSeconds, out.EstimatedCallAt = &wait, &callAt
	return out, nil
}

func intPtr(value int) *int { return &value }

func weightedAverage(values []float64) float64 {
	if len(values) == 0 { return 0 }
	var weightedSum, weightSum float64
	for i, value := range values { weight := float64(len(values)-i); weightedSum += value * weight; weightSum += weight }
	return weightedSum / weightSum
}

func percentile(values []float64, fraction float64) float64 {
	if len(values) == 0 { return 0 }
	ordered := append([]float64(nil), values...)
	sort.Float64s(ordered)
	if len(ordered) == 1 { return ordered[0] }
	position := fraction * float64(len(ordered)-1)
	lower, upper := int(math.Floor(position)), int(math.Ceil(position))
	if lower == upper { return ordered[lower] }
	return ordered[lower] + (ordered[upper]-ordered[lower])*(position-float64(lower))
}

func etaWait(position int, average float64) int {
	return int(math.Max(60, math.Min(1800, float64(max(position-1, 0))*average)))
}
