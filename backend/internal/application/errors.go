package application

import "errors"

var (
	ErrNotFound            = errors.New("not found")
	ErrInvalidState        = errors.New("invalid state")
	ErrWindowBusy          = errors.New("window busy")
	ErrNoEligibleTickets   = errors.New("no eligible tickets")
	ErrIdempotencyConflict = errors.New("idempotency conflict")
)
