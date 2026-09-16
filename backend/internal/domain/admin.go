package domain

import "time"

type AdminMetrics struct {
	WaitingClientsCount int `json:"waitingClientsCount"`
	AvgWaitTimeMinutes  int `json:"avgWaitTimeMinutes"`
	MaxWaitTimeMinutes  int `json:"maxWaitTimeMinutes"`
	ServedTodayCount    int `json:"servedTodayCount"`
	ActiveWindowsCount  int `json:"activeWindowsCount"`
	TotalWindowsCount   int `json:"totalWindowsCount"`
}

type AdminWindow struct {
	ID                  string       `json:"id"`
	Number              int          `json:"number"`
	Status              WindowStatus `json:"status"`
	CurrentTicketNumber *string      `json:"currentTicketNumber"`
	CurrentService      *string      `json:"currentService"`
	Services            []Service    `json:"services"`
	ServedCount         int          `json:"servedCount"`
	OperatorName        *string      `json:"operatorName,omitempty"`
}

type AdminQueueTicket struct {
	ID              string       `json:"id"`
	PublicNumber    string       `json:"publicNumber"`
	Source          TicketSource `json:"source"`
	ServiceName     string       `json:"serviceName"`
	QueueEnteredAt  time.Time    `json:"queueEnteredAt"`
	WaitTimeMinutes int          `json:"waitTimeMinutes"`
	Status          TicketStatus `json:"status"`
}

type PriorityRule struct {
	Source              TicketSource `json:"source"`
	Name                string       `json:"name"`
	Weight              int          `json:"weight"`
	MaxWaitLimitMinutes int          `json:"maxWaitLimitMinutes"`
	Description         string       `json:"description"`
}

type AnomalyType string

const (
	AnomalyExceededWait AnomalyType = "EXCEEDED_WAIT"
	AnomalyUnfinished   AnomalyType = "UNFINISHED"
	AnomalyNoShow       AnomalyType = "NO_SHOW"
	AnomalyTechIssue    AnomalyType = "TECH_ISSUE"
)

type AnomalyTicket struct {
	ID              string      `json:"id"`
	PublicNumber    string      `json:"publicNumber"`
	Type            AnomalyType `json:"type"`
	Description     string      `json:"description"`
	Time            time.Time   `json:"time"`
	DurationMinutes int         `json:"durationMinutes"`
}

type AdminBranchOverview struct {
	BranchID   string             `json:"branchId"`
	BranchName string             `json:"branchName"`
	Metrics    AdminMetrics       `json:"metrics"`
	Windows    []AdminWindow      `json:"windows"`
	Queue      []AdminQueueTicket `json:"queue"`
	Priorities []PriorityRule     `json:"priorities"`
	Anomalies  []AnomalyTicket    `json:"anomalies"`
}
