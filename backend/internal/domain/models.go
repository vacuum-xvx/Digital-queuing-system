package domain

import "time"

type TicketSource string

const (
	SourceAppointment TicketSource = "APPOINTMENT"
	SourceQR          TicketSource = "QR"
	SourceLive        TicketSource = "LIVE"
)

type TicketStatus string

const (
	StatusScheduled TicketStatus = "SCHEDULED"
	StatusWaiting   TicketStatus = "WAITING"
	StatusCalled    TicketStatus = "CALLED"
	StatusServing   TicketStatus = "SERVING"
	StatusCompleted TicketStatus = "COMPLETED"
	StatusCancelled TicketStatus = "CANCELLED"
	StatusNoShow    TicketStatus = "NO_SHOW"
)

type WindowStatus string

const (
	WindowStatusClosed  WindowStatus = "CLOSED"
	WindowStatusOpen    WindowStatus = "OPEN"
	WindowStatusClosing WindowStatus = "CLOSING"
)

type Branch struct {
	ID   string
	Name string
}

type Service struct {
	ID   string
	Code string
	Name string
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
