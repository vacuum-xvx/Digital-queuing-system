// Package application defines the transport-independent Sprint #1 boundary.
package application

import (
	"context"
	"errors"
	"time"

	"postcode/backend/internal/domain"
)

var (
	ErrNotFound            = errors.New("not found")
	ErrInvalidState        = errors.New("invalid state")
	ErrWindowBusy          = errors.New("window busy")
	ErrNoEligibleTickets   = errors.New("no eligible tickets")
	ErrIdempotencyConflict = errors.New("idempotency conflict")
)

type CreateQRTicketCommand struct {
	BranchID       string
	ServiceID      string
	IdempotencyKey string
}

type CreateAppointmentCommand struct {
	BranchID       string
	ServiceID      string
	ScheduledTime  time.Time
	IdempotencyKey string
}

type CreateLiveTicketCommand struct {
	BranchID       string
	WindowID       string
	ServiceID      string
	IdempotencyKey string
}

type CreateQRTicketResult struct {
	Ticket   domain.Ticket
	Replayed bool
}

type UseCases interface {
	ListBranches(ctx context.Context) ([]domain.Branch, error)
	ListBranchServices(ctx context.Context, branchID string) ([]domain.Service, error)
	ListBranchWindows(ctx context.Context, branchID string) ([]domain.Window, error)
	CreateQRTicket(ctx context.Context, cmd CreateQRTicketCommand) (CreateQRTicketResult, error)
	CreateAppointment(ctx context.Context, cmd CreateAppointmentCommand) (CreateQRTicketResult, error)
	CreateLiveTicket(ctx context.Context, cmd CreateLiveTicketCommand) (domain.Ticket, error)
	CancelTicket(ctx context.Context, ticketID string) (domain.Ticket, error)
	ReturnTicket(ctx context.Context, ticketID, windowID string) (domain.Ticket, error)
	RedirectTicket(ctx context.Context, ticketID, windowID, targetServiceID string) (domain.Ticket, error)
	GetTicket(ctx context.Context, ticketID string) (domain.Ticket, error)
	GetCurrentTicket(ctx context.Context, windowID string) (*domain.Ticket, error)
	CallNext(ctx context.Context, windowID string) (domain.Ticket, error)
	StartService(ctx context.Context, ticketID string) (domain.Ticket, error)
	CompleteService(ctx context.Context, ticketID string) (domain.Ticket, error)
}

