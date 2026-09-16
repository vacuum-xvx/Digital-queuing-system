package application

import (
	"context"
	"postcode/backend/internal/domain"
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

type UseCases interface {
	ListBranches(
		ctx context.Context,
	) ([]domain.Branch, error)

	ListBranchServices(
		ctx context.Context,
		branchID string,
	) ([]domain.Service, error)

	ListBranchWindows(
		ctx context.Context,
		branchID string,
	) ([]domain.Window, error)

	CreateQRTicket(
		ctx context.Context,
		cmd CreateQRTicketCommand,
	) (CreateQRTicketResult, error)

	GetTicket(
		ctx context.Context,
		ticketID string,
	) (domain.Ticket, error)

	GetCurrentTicket(
		ctx context.Context,
		windowID string,
	) (*domain.Ticket, error)

	CallNext(
		ctx context.Context,
		windowID string,
	) (domain.Ticket, error)

	StartService(
		ctx context.Context,
		ticketID string,
	) (domain.Ticket, error)

	CompleteService(
		ctx context.Context,
		ticketID string,
	) (domain.Ticket, error)
}
