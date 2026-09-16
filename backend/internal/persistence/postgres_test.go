package persistence

import (
	"context"
	"errors"
	"fmt"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"postcode/backend/internal/application"
)

func TestBoundaryErrors(t *testing.T) {
	for _, sentinel := range []error{application.ErrNotFound, application.ErrInvalidState, application.ErrWindowBusy, application.ErrNoEligibleTickets, application.ErrIdempotencyConflict} {
		if !errors.Is(fmt.Errorf("operation: %w", sentinel), sentinel) {
			t.Fatal("sentinel cannot be wrapped")
		}
	}
	for _, tc := range []struct{ input, want error }{
		{pgx.ErrNoRows, application.ErrNotFound},
		{context.Canceled, context.Canceled},
		{context.DeadlineExceeded, context.DeadlineExceeded},
		{&pgconn.PgError{Code: "23505", ConstraintName: "tickets_one_active_per_window"}, application.ErrWindowBusy},
	} {
		if !errors.Is(dbError(tc.input), tc.want) {
			t.Fatalf("mapping %v", tc.input)
		}
	}
	private := &pgconn.PgError{Code: "23503", Message: "private detail"}
	err := dbError(private)
	var exposed *pgconn.PgError
	if errors.As(err, &exposed) || err.Error() != "queue persistence operation failed" {
		t.Fatal("driver error exposed")
	}
	if _, err := uuid("invalid"); !errors.Is(err, application.ErrNotFound) {
		t.Fatal(err)
	}
}
