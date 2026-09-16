// Package application defines the transport-independent Sprint #1 boundary.
package application

import (
	"context"
	"errors"
	"postcode/backend/internal/domain"
)

var (
	ErrNotFound            = errors.New("not found")
	ErrInvalidState        = errors.New("invalid state")
	ErrWindowClosed        = errors.New("window closed")
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

type CreateAppointmentCommand struct {
	BranchID       string
	ServiceID      string
	ScheduledAt    string // ISO8601 or similar
	IdempotencyKey string
}

type RedirectTicketCommand struct {
	TicketID     string
	NewServiceID string
	NewWindowID  string // optional
}
type UseCases interface {
	ListBranches(ctx context.Context) ([]domain.Branch, error)
	ListBranchServices(ctx context.Context, branchID string) ([]domain.Service, error)
	ListBranchWindows(ctx context.Context, branchID string) ([]domain.Window, error)
	CreateQRTicket(ctx context.Context, cmd CreateQRTicketCommand) (CreateQRTicketResult, error)
	CreateLiveTicket(ctx context.Context, cmd CreateLiveTicketCommand) (domain.Ticket, error)
	CreateAppointment(ctx context.Context, cmd CreateAppointmentCommand) (domain.Ticket, error)
	
	GetTicket(ctx context.Context, ticketID string) (domain.Ticket, error)
	GetCurrentTicket(ctx context.Context, windowID string) (*domain.Ticket, error)
	
	ChangeWindowStatus(ctx context.Context, windowID string, status domain.WindowStatus) (domain.Window, error)
	CallNext(ctx context.Context, windowID string) (domain.Ticket, error)
	
	StartService(ctx context.Context, ticketID string) (domain.Ticket, error)
	CompleteService(ctx context.Context, ticketID string) (domain.Ticket, error)
	ReturnTicket(ctx context.Context, ticketID string) (domain.Ticket, error)
	RedirectTicket(ctx context.Context, cmd RedirectTicketCommand) (domain.Ticket, error)
	GetAdminOverview(ctx context.Context, branchID string) (domain.AdminBranchOverview, error)
	SavePriorityRules(ctx context.Context, branchID string, rules []domain.PriorityRule) error
}
