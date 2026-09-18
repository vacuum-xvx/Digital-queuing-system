// Package application defines the transport-independent Sprint #1 boundary.
package application

import (
	"context"
	"errors"
	"fmt"
	"postcode/backend/internal/domain"
	"time"
)

var (
	ErrNotFound            = errors.New("not found")
	ErrInvalidState        = errors.New("invalid state")
	ErrWindowClosed        = fmt.Errorf("window closed: %w", ErrInvalidState)
	ErrWindowBusy          = errors.New("window busy")
	ErrNoEligibleTickets   = errors.New("no eligible tickets")
	ErrIdempotencyConflict = errors.New("idempotency conflict")
)

type CreateQRTicketCommand struct {
	BranchID       string
	ServiceID      string
	IdempotencyKey string
}
type CreateQRTicketResult struct {
	Ticket   domain.Ticket
	Replayed bool
}

type CreateLiveTicketCommand struct {
	BranchID       string
	ServiceID      string
	IdempotencyKey string
}

type CreateLiveTicketResult struct {
	Ticket   domain.Ticket
	Replayed bool
}

type CreateAppointmentCommand struct {
	BranchID       string
	ServiceID      string
	ScheduledAt    time.Time
	IdempotencyKey string
}

// UpdateWindowServicesCommand replaces the set of services a postal window is
// allowed to serve (window_services). At least one service is required, because a
// window without capabilities can never be assigned a ticket by the queue engine.
type UpdateWindowServicesCommand struct {
	WindowID   string
	ServiceIDs []string
}

type RedirectTicketCommand struct {
	TicketID     string
	NewServiceID string
	NewWindowID  string // optional
}
type UseCases interface {
	GetTicketETA(ctx context.Context, ticketID string) (domain.TicketETA, error)
	ArriveAppointment(ctx context.Context, ticketID string) (AppointmentView, error)
	MarkNoShow(ctx context.Context, ticketID string) (domain.Ticket, error)
	GetQueuePosition(ctx context.Context, ticketID string) (domain.QueuePosition, error)
	ListBranches(ctx context.Context) ([]domain.Branch, error)
	ListBranchServices(ctx context.Context, branchID string) ([]domain.Service, error)
	ListBranchWindows(ctx context.Context, branchID string) ([]domain.Window, error)
	CreateQRTicket(ctx context.Context, cmd CreateQRTicketCommand) (CreateQRTicketResult, error)
	CreateLiveTicket(ctx context.Context, cmd CreateLiveTicketCommand) (CreateLiveTicketResult, error)
	CreateAppointment(ctx context.Context, cmd CreateAppointmentCommand) (CreateAppointmentResult, error)
	CancelAppointment(ctx context.Context, ticketID string) (AppointmentView, error)
	GetQueuePolicy(ctx context.Context, branchID string) (domain.QueuePolicy, error)
	UpdateQueuePolicy(ctx context.Context, cmd UpdateQueuePolicyCommand) (domain.QueuePolicy, error)
	ListTicketEvents(ctx context.Context, ticketID string) ([]domain.TicketEvent, error)

	GetTicket(ctx context.Context, ticketID string) (domain.Ticket, error)
	GetCurrentTicket(ctx context.Context, windowID string) (*domain.Ticket, error)

	ChangeWindowStatus(ctx context.Context, windowID string, status domain.WindowStatus) (domain.Window, error)
	UpdateWindowServices(ctx context.Context, cmd UpdateWindowServicesCommand) (domain.Window, error)
	CallNext(ctx context.Context, windowID string) (domain.Ticket, error)

	StartService(ctx context.Context, ticketID string) (domain.Ticket, error)
	CompleteService(ctx context.Context, ticketID string) (domain.Ticket, error)
	ReturnTicket(ctx context.Context, ticketID string) (domain.Ticket, error)
	RedirectTicket(ctx context.Context, cmd RedirectTicketCommand) (domain.Ticket, error)
	GetAdminOverview(ctx context.Context, branchID string) (domain.AdminBranchOverview, error)
	SavePriorityRules(ctx context.Context, branchID string, rules []domain.PriorityRule) error

	// Auth & Roles
	Register(ctx context.Context, email, password string) (domain.User, error)
	ConfirmEmail(ctx context.Context, token string) error
	Login(ctx context.Context, email, password string) (domain.Session, error)
	Logout(ctx context.Context, token string) error
	GetSessionUser(ctx context.Context, token string) (domain.User, error)
	ListUsers(ctx context.Context) ([]domain.User, error)
	ChangeUserRole(ctx context.Context, userID string, role domain.UserRole) (domain.User, error)
}

var ErrPolicyVersionConflict = errors.New("queue policy version conflict")

type AppointmentView struct {
	Ticket      domain.Ticket
	ScheduledAt time.Time
}
type CreateAppointmentResult struct {
	Appointment AppointmentView
	Replayed    bool
}
type UpdateQueuePolicyCommand struct {
	BranchID                        string
	AppointmentDuePriority          int
	QRPriority                      int
	LivePriority                    int
	AntiStarvationThresholdMinutes  int
	AntiStarvationPointsPerMinute   int
	AppointmentGraceMinutes         int
	AppointmentLatePenaltyPerMinute int
	AppointmentLatePenaltyMaxPoints int
	ExpectedVersion                 int64
}
