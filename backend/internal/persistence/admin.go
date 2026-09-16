package persistence

import (
	"context"

	"postcode/backend/internal/domain"
)

// SavePriorityRules persists priority rules (Mock implementation for MVP).
func (p *Postgres) SavePriorityRules(ctx context.Context, branchID string, rules []domain.PriorityRule) error {
	// For MVP, we use static config or mock. We will just return nil to satisfy the interface.
	return nil
}

// GetAdminOverview aggregates metrics, windows, queue, and anomalies.
func (p *Postgres) GetAdminOverview(ctx context.Context, branchID string) (domain.AdminBranchOverview, error) {
	var overview domain.AdminBranchOverview
	overview.BranchID = branchID

	id, err := p.branch(ctx, branchID)
	if err != nil {
		return overview, err
	}

	// 1. Get branch name
	err = p.pool.QueryRow(ctx, `SELECT name FROM branches WHERE id=$1`, id).Scan(&overview.BranchName)
	if err != nil {
		return overview, dbError(err)
	}

	// 2. Metrics
	err = p.pool.QueryRow(ctx, `
		SELECT 
			COUNT(CASE WHEN status = 'WAITING' THEN 1 END) as waitingClientsCount,
			COUNT(CASE WHEN status = 'COMPLETED' AND queue_entered_at::date = CURRENT_DATE THEN 1 END) as servedTodayCount,
			COALESCE(AVG(EXTRACT(EPOCH FROM (called_at - queue_entered_at))/60) FILTER (WHERE called_at IS NOT NULL AND queue_entered_at::date = CURRENT_DATE)::int, 0) as avgWaitTimeMinutes,
			COALESCE(MAX(EXTRACT(EPOCH FROM (called_at - queue_entered_at))/60) FILTER (WHERE called_at IS NOT NULL AND queue_entered_at::date = CURRENT_DATE)::int, 0) as maxWaitTimeMinutes
		FROM tickets 
		WHERE branch_id = $1
	`, id).Scan(&overview.Metrics.WaitingClientsCount, &overview.Metrics.ServedTodayCount, &overview.Metrics.AvgWaitTimeMinutes, &overview.Metrics.MaxWaitTimeMinutes)
	if err != nil {
		return overview, dbError(err)
	}

	// Active windows count
	err = p.pool.QueryRow(ctx, `
		SELECT 
			COUNT(CASE WHEN status = 'OPEN' THEN 1 END) as activeWindowsCount,
			COUNT(*) as totalWindowsCount
		FROM windows 
		WHERE branch_id = $1
	`, id).Scan(&overview.Metrics.ActiveWindowsCount, &overview.Metrics.TotalWindowsCount)
	if err != nil {
		return overview, dbError(err)
	}

	// 3. Windows list
	windows, err := p.ListBranchWindows(ctx, branchID)
	if err != nil {
		return overview, err
	}

	for _, w := range windows {
		aw := domain.AdminWindow{
			ID:       w.ID,
			Number:   w.Number,
			Status:   w.Status,
			Services: []domain.Service{}, // We will skip mapping services perfectly for now, or just use what ListBranchWindows returns
		}
		aw.Services = w.Services
		
		// Find current ticket
		var currentTicket string
		var currentService string
		err = p.pool.QueryRow(ctx, `
			SELECT t.public_number, s.name 
			FROM tickets t 
			JOIN services s ON s.id = t.service_id 
			WHERE t.window_id = $1 AND t.status IN ('CALLED', 'SERVING') 
			LIMIT 1
		`, w.ID).Scan(&currentTicket, &currentService)
		if err == nil {
			aw.CurrentTicketNumber = &currentTicket
			aw.CurrentService = &currentService
		}

		// Served count
		p.pool.QueryRow(ctx, `
			SELECT COUNT(*) 
			FROM tickets 
			WHERE window_id = $1 AND status = 'COMPLETED' AND queue_entered_at::date = CURRENT_DATE
		`, w.ID).Scan(&aw.ServedCount)
		
		overview.Windows = append(overview.Windows, aw)
	}

	// 4. Queue (WAITING, CALLED, SERVING)
	rows, err := p.pool.Query(ctx, `
		SELECT t.id, t.public_number, t.source, s.name, t.queue_entered_at, t.status,
			   EXTRACT(EPOCH FROM (NOW() - t.queue_entered_at))/60 as wait_time_minutes
		FROM tickets t
		JOIN services s ON s.id = t.service_id
		WHERE t.branch_id = $1 AND t.status IN ('WAITING', 'CALLED', 'SERVING')
		ORDER BY t.queue_entered_at ASC
	`, id)
	if err != nil {
		return overview, dbError(err)
	}
	defer rows.Close()

	for rows.Next() {
		var qt domain.AdminQueueTicket
		var waitTime float64
		if err := rows.Scan(&qt.ID, &qt.PublicNumber, &qt.Source, &qt.ServiceName, &qt.QueueEnteredAt, &qt.Status, &waitTime); err != nil {
			return overview, dbError(err)
		}
		qt.WaitTimeMinutes = int(waitTime)
		overview.Queue = append(overview.Queue, qt)
		
		// 5. Anomalies detection (e.g. wait time > 15 mins)
		if qt.Status == "WAITING" && qt.WaitTimeMinutes > 15 {
			overview.Anomalies = append(overview.Anomalies, domain.AnomalyTicket{
				ID: qt.ID,
				PublicNumber: qt.PublicNumber,
				Type: domain.AnomalyExceededWait,
				Description: "Превышено максимальное время ожидания",
				Time: qt.QueueEnteredAt,
				DurationMinutes: qt.WaitTimeMinutes,
			})
		}
	}

	// Add default priorities
	overview.Priorities = []domain.PriorityRule{
		{Source: "APPOINTMENT", Name: "Предварительная запись", Weight: 100, MaxWaitLimitMinutes: 5, Description: "Обслуживаются первыми по времени"},
		{Source: "QR", Name: "QR-код", Weight: 50, MaxWaitLimitMinutes: 15, Description: "Живая очередь по коду в отделении"},
		{Source: "LIVE", Name: "Живая очередь", Weight: 10, MaxWaitLimitMinutes: 30, Description: "Талоны от оператора"},
	}
	
	if overview.Windows == nil {
		overview.Windows = []domain.AdminWindow{}
	}
	if overview.Queue == nil {
		overview.Queue = []domain.AdminQueueTicket{}
	}
	if overview.Anomalies == nil {
		overview.Anomalies = []domain.AnomalyTicket{}
	}

	return overview, nil
}
