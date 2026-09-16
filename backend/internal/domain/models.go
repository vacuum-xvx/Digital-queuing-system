package domain

import "time"

type TicketSource string

const (
	TicketSourceAppointment TicketSource = "APPOINTMENT"
	TicketSourceQR          TicketSource = "QR"
	TicketSourceLive        TicketSource = "LIVE"
)

type TicketStatus string

const (
	TicketStatusScheduled TicketStatus = "SCHEDULED"
	TicketStatusWaiting   TicketStatus = "WAITING"
	TicketStatusCalled    TicketStatus = "CALLED"
	TicketStatusServing   TicketStatus = "SERVING"
	TicketStatusCompleted TicketStatus = "COMPLETED"
	TicketStatusCancelled TicketStatus = "CANCELLED"
	TicketStatusNoShow    TicketStatus = "NO_SHOW"
)

type WindowStatus string

const (
	WindowStatusClosed  WindowStatus = "CLOSED"
	WindowStatusOpen    WindowStatus = "OPEN"
	WindowStatusClosing WindowStatus = "CLOSING"
)

type Branch struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}
type Service struct {
	ID   string `json:"id"`
	Code string `json:"code"`
	Name string `json:"name"`
}
type Window struct {
	ID       string
	BranchID string
	Number   int
	Status   WindowStatus
	Services []Service
}
type WindowRef struct {
	ID     string
	Number int
}
type Ticket struct {
	ID               string
	PublicNumber     string
	BranchID         string
	ServiceID        string
	Source           TicketSource
	Status           TicketStatus
	Window           *WindowRef
	CreatedAt        time.Time
	QueueEnteredAt   time.Time
	CalledAt         *time.Time
	ServiceStartedAt *time.Time
	CompletedAt      *time.Time
}
