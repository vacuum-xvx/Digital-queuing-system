package persistence

import (
	"context"
	"fmt"
	"math"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"postcode/backend/internal/domain"
)

// SavePriorityRules persists priority rules for a branch using UPSERT.
func (p *Postgres) SavePriorityRules(ctx context.Context, branchID string, rules []domain.PriorityRule) error {
	id, err := p.branch(ctx, branchID)
	if err != nil {
		return err
	}
	tx, err := p.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return dbError(err)
	}
	defer tx.Rollback(context.Background())

	// Delete existing rules and replace — simpler than UPSERT with variable source list.
	if _, err = tx.Exec(ctx, `DELETE FROM priority_rules WHERE branch_id = $1`, id); err != nil {
		return dbError(err)
	}
	for _, r := range rules {
		_, err = tx.Exec(ctx,
			`INSERT INTO priority_rules(branch_id, source, name, weight, max_wait_limit_minutes, description)
			 VALUES($1, $2, $3, $4, $5, $6)`,
			id, string(r.Source), r.Name, r.Weight, r.MaxWaitLimitMinutes, r.Description,
		)
		if err != nil {
			return dbError(err)
		}
	}
	return dbError(tx.Commit(ctx))
}

// GetAdminOverview aggregates metrics, windows, queue, priorities and anomalies in
// a minimal number of round-trips (no N+1 loops).
func (p *Postgres) GetAdminOverview(ctx context.Context, branchID string) (domain.AdminBranchOverview, error) {
	var overview domain.AdminBranchOverview
	overview.BranchID = branchID

	id, err := p.branch(ctx, branchID)
	if err != nil {
		return overview, err
	}

	// 1. Branch name
	if err = p.pool.QueryRow(ctx, `SELECT name FROM branches WHERE id=$1`, id).Scan(&overview.BranchName); err != nil {
		return overview, dbError(err)
	}

	// 2. Ticket metrics — single query
	// Fix: ::int cast applied to the full AVG/MAX expressions, not to the filter predicate.
	err = p.pool.QueryRow(ctx, `
		SELECT
			COUNT(CASE WHEN status = 'WAITING' THEN 1 END),
			COUNT(CASE WHEN status = 'COMPLETED' AND (queue_entered_at AT TIME ZONE 'Europe/Moscow')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Moscow')::date THEN 1 END),
			COALESCE((
				AVG(EXTRACT(EPOCH FROM (called_at - queue_entered_at)) / 60)
				FILTER (WHERE called_at IS NOT NULL AND (queue_entered_at AT TIME ZONE 'Europe/Moscow')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Moscow')::date)
			)::int, 0),
			COALESCE((
				MAX(EXTRACT(EPOCH FROM (called_at - queue_entered_at)) / 60)
				FILTER (WHERE called_at IS NOT NULL AND (queue_entered_at AT TIME ZONE 'Europe/Moscow')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Moscow')::date)
			)::int, 0),
			percentile_cont(0.9) WITHIN GROUP (ORDER BY (EXTRACT(EPOCH FROM (NOW() - queue_entered_at)) / 60)::double precision)
			FILTER (WHERE status = 'WAITING')
		FROM tickets
		WHERE branch_id = $1
	`, id).Scan(
		&overview.Metrics.WaitingClientsCount,
		&overview.Metrics.ServedTodayCount,
		&overview.Metrics.AvgWaitTimeMinutes,
		&overview.Metrics.MaxWaitTimeMinutes,
		&overview.Metrics.P90WaitMinutes,
	)
	if err != nil {
		return overview, dbError(err)
	}

	// 3. Window counts — single query
	if err = p.pool.QueryRow(ctx, `
		SELECT
			COUNT(CASE WHEN status = 'OPEN' THEN 1 END),
			COUNT(*)
		FROM windows
		WHERE branch_id = $1
	`, id).Scan(&overview.Metrics.ActiveWindowsCount, &overview.Metrics.TotalWindowsCount); err != nil {
		return overview, dbError(err)
	}

	// 4. Build window list (already uses an efficient single query internally)
	windows, err := p.ListBranchWindows(ctx, branchID)
	if err != nil {
		return overview, err
	}

	// 5. Batch-load current active ticket per window (one query for all windows)
	//    Result: map[windowID] → (publicNumber, serviceName)
	type activeTicket struct {
		publicNumber string
		serviceName  string
	}
	activeTickets := make(map[string]activeTicket)

	rows, err := p.pool.Query(ctx, `
		SELECT t.window_id::text, t.public_number, s.name
		FROM tickets t
		JOIN services s ON s.id = t.service_id
		WHERE t.branch_id = $1 AND t.status IN ('CALLED', 'SERVING')
	`, id)
	if err != nil {
		return overview, dbError(err)
	}
	func() {
		defer rows.Close()
		for rows.Next() {
			var wid, pub, svc string
			if scanErr := rows.Scan(&wid, &pub, &svc); scanErr == nil {
				activeTickets[wid] = activeTicket{publicNumber: pub, serviceName: svc}
			}
		}
	}()
	if err = rows.Err(); err != nil {
		return overview, dbError(err)
	}

	// 6. Batch-load served-today count per window (one query for all windows)
	servedByWindow := make(map[string]int)
	rows2, err := p.pool.Query(ctx, `
		SELECT window_id::text, COUNT(*)
		FROM tickets
		WHERE branch_id = $1 AND status = 'COMPLETED' AND (queue_entered_at AT TIME ZONE 'Europe/Moscow')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Moscow')::date
		  AND window_id IS NOT NULL
		GROUP BY window_id
	`, id)
	if err != nil {
		return overview, dbError(err)
	}
	func() {
		defer rows2.Close()
		for rows2.Next() {
			var wid string
			var cnt int
			if scanErr := rows2.Scan(&wid, &cnt); scanErr == nil {
				servedByWindow[wid] = cnt
			}
		}
	}()
	if err = rows2.Err(); err != nil {
		return overview, dbError(err)
	}

	// 7. Assemble AdminWindow list
	overview.Windows = make([]domain.AdminWindow, 0, len(windows))
	for _, w := range windows {
		aw := domain.AdminWindow{
			ID:          w.ID,
			Number:      w.Number,
			Status:      w.Status,
			Services:    w.Services,
			ServedCount: servedByWindow[w.ID],
		}
		if at, ok := activeTickets[w.ID]; ok {
			aw.CurrentTicketNumber = &at.publicNumber
			aw.CurrentService = &at.serviceName
		}
		overview.Windows = append(overview.Windows, aw)
	}
	if overview.Metrics.P90WaitMinutes != nil {
		closedCount := 0
		for _, window := range overview.Windows {
			if window.Status == domain.WindowStatusClosed { closedCount++ }
		}
		p90 := *overview.Metrics.P90WaitMinutes
		shouldRecommend := p90 > 12 || (float64(overview.Metrics.AvgWaitTimeMinutes) > 8 && overview.Metrics.WaitingClientsCount > overview.Metrics.ActiveWindowsCount*3)
		if shouldRecommend && closedCount > 0 {
			recommended := int(math.Ceil((p90 - 8) / 5))
			if recommended < 1 { recommended = 1 }
			if recommended > closedCount { recommended = closedCount }
			severity := "warning"
			if p90 > 15 { severity = "critical" }
			overview.WindowRecommendation = &domain.WindowRecommendation{
				RecommendedCount: recommended,
				Reason: fmt.Sprintf("P90=%.0f мин > SLA 12, риск нарушения — рекомендуем открыть %d окно", p90, recommended),
				Severity: severity, P90WaitMinutes: p90,
			}
		}
	}

	// 8. Queue (WAITING, CALLED, SERVING) — single query
	qrows, err := p.pool.Query(ctx, `
		SELECT t.id::text, t.public_number, t.source, t.service_id::text, s.name, t.queue_entered_at, t.status,
			   EXTRACT(EPOCH FROM (NOW() - t.queue_entered_at)) / 60
		FROM tickets t
		JOIN services s ON s.id = t.service_id
		WHERE t.branch_id = $1 AND t.status IN ('SCHEDULED', 'WAITING', 'CALLED', 'SERVING')
		ORDER BY t.queue_entered_at ASC
	`, id)
	if err != nil {
		return overview, dbError(err)
	}
	defer qrows.Close()

	overview.Queue = make([]domain.AdminQueueTicket, 0)
	overview.Anomalies = make([]domain.AnomalyTicket, 0)

	for qrows.Next() {
		var qt domain.AdminQueueTicket
		var waitTime float64
		if err = qrows.Scan(&qt.ID, &qt.PublicNumber, &qt.Source, &qt.ServiceID, &qt.ServiceName, &qt.QueueEnteredAt, &qt.Status, &waitTime); err != nil {
			return overview, dbError(err)
		}
		qt.WaitTimeMinutes = int(waitTime)
		overview.Queue = append(overview.Queue, qt)

		// Anomaly: exceeded wait time while still waiting
		if qt.Status == domain.TicketStatusWaiting && qt.WaitTimeMinutes > 15 {
			overview.Anomalies = append(overview.Anomalies, domain.AnomalyTicket{
				ID:              qt.ID,
				PublicNumber:    qt.PublicNumber,
				Type:            domain.AnomalyExceededWait,
				Description:     "Превышено максимальное время ожидания",
				Time:            qt.QueueEnteredAt,
				DurationMinutes: qt.WaitTimeMinutes,
			})
		}
	}
	if err = qrows.Err(); err != nil {
		return overview, dbError(err)
	}

	// 8b. Load NO_SHOW anomalies today
	nsRows, err := p.pool.Query(ctx, `
		SELECT id::text, public_number, no_show_at
		FROM tickets
		WHERE branch_id = $1 AND status = 'NO_SHOW' AND (queue_entered_at AT TIME ZONE 'Europe/Moscow')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Moscow')::date
		ORDER BY no_show_at DESC
		LIMIT 10
	`, id)
	if err == nil {
		defer nsRows.Close()
		for nsRows.Next() {
			var tid, pub string
			var nsTime *time.Time
			if scanErr := nsRows.Scan(&tid, &pub, &nsTime); scanErr == nil {
				tVal := time.Now()
				if nsTime != nil {
					tVal = *nsTime
				}
				overview.Anomalies = append(overview.Anomalies, domain.AnomalyTicket{
					ID:           tid,
					PublicNumber: pub,
					Type:         domain.AnomalyNoShow,
					Description:  "Клиент не явился к окну оператора",
					Time:         tVal,
				})
			}
		}
	}

	// 9. Priority rules from DB
	overview.Priorities, err = p.loadPriorityRules(ctx, id)
	if err != nil {
		return overview, err
	}

	return overview, nil
}

// loadPriorityRules reads persisted rules; falls back to defaults if none exist.
func (p *Postgres) loadPriorityRules(ctx context.Context, id pgtype.UUID) ([]domain.PriorityRule, error) {
	rows, err := p.pool.Query(ctx, `
		SELECT source, name, weight, max_wait_limit_minutes, description
		FROM priority_rules
		WHERE branch_id = $1
		ORDER BY weight DESC, source
	`, id)
	if err != nil {
		return nil, dbError(err)
	}
	defer rows.Close()

	var rules []domain.PriorityRule
	for rows.Next() {
		var r domain.PriorityRule
		if err = rows.Scan(&r.Source, &r.Name, &r.Weight, &r.MaxWaitLimitMinutes, &r.Description); err != nil {
			return nil, dbError(err)
		}
		rules = append(rules, r)
	}
	if err = rows.Err(); err != nil {
		return nil, dbError(err)
	}

	// Fallback to hardcoded defaults if branch has no rules yet
	if len(rules) == 0 {
		rules = defaultPriorityRules()
	}
	return rules, nil
}

func defaultPriorityRules() []domain.PriorityRule {
	return []domain.PriorityRule{
		{Source: "APPOINTMENT", Name: "Предварительная запись", Weight: 100, MaxWaitLimitMinutes: 5, Description: "Обслуживаются первыми по времени"},
		{Source: "QR", Name: "QR-код", Weight: 50, MaxWaitLimitMinutes: 15, Description: "Живая очередь по коду в отделении"},
		{Source: "LIVE", Name: "Живая очередь", Weight: 10, MaxWaitLimitMinutes: 30, Description: "Талоны от оператора"},
	}
}
