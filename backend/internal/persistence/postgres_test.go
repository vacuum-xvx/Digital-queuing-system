package persistence

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"postcode/backend/internal/application"
	"postcode/backend/internal/domain"
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

func TestNewMethodsValidation(t *testing.T) {
	p := New(nil)
	ctx := context.Background()
	validUUID := "11111111-1111-1111-1111-111111111111"
	validTime := time.Now().UTC().Add(time.Hour)

	t.Run("CreateAppointment", func(t *testing.T) {
		// Invalid BranchID
		_, err := p.CreateAppointment(ctx, application.CreateAppointmentCommand{
			BranchID:       "invalid-uuid",
			ServiceID:      validUUID,
			ScheduledTime:  validTime,
			IdempotencyKey: "key-1",
		})
		if !errors.Is(err, application.ErrNotFound) {
			t.Fatalf("expected ErrNotFound for invalid BranchID, got: %v", err)
		}

		// Invalid ServiceID
		_, err = p.CreateAppointment(ctx, application.CreateAppointmentCommand{
			BranchID:       validUUID,
			ServiceID:      "invalid-uuid",
			ScheduledTime:  validTime,
			IdempotencyKey: "key-1",
		})
		if !errors.Is(err, application.ErrNotFound) {
			t.Fatalf("expected ErrNotFound for invalid ServiceID, got: %v", err)
		}

		// Empty IdempotencyKey
		_, err = p.CreateAppointment(ctx, application.CreateAppointmentCommand{
			BranchID:       validUUID,
			ServiceID:      validUUID,
			ScheduledTime:  validTime,
			IdempotencyKey: "",
		})
		if !errors.Is(err, application.ErrInvalidState) {
			t.Fatalf("expected ErrInvalidState for empty IdempotencyKey, got: %v", err)
		}

		// Whitespace IdempotencyKey
		_, err = p.CreateAppointment(ctx, application.CreateAppointmentCommand{
			BranchID:       validUUID,
			ServiceID:      validUUID,
			ScheduledTime:  validTime,
			IdempotencyKey: "   ",
		})
		if !errors.Is(err, application.ErrInvalidState) {
			t.Fatalf("expected ErrInvalidState for whitespace IdempotencyKey, got: %v", err)
		}

		// Zero ScheduledTime
		_, err = p.CreateAppointment(ctx, application.CreateAppointmentCommand{
			BranchID:       validUUID,
			ServiceID:      validUUID,
			ScheduledTime:  time.Time{},
			IdempotencyKey: "key-1",
		})
		if !errors.Is(err, application.ErrInvalidState) {
			t.Fatalf("expected ErrInvalidState for zero ScheduledTime, got: %v", err)
		}
	})

	t.Run("CreateLiveTicket", func(t *testing.T) {
		// Invalid BranchID
		_, err := p.CreateLiveTicket(ctx, application.CreateLiveTicketCommand{
			BranchID:       "invalid-uuid",
			WindowID:       validUUID,
			ServiceID:      validUUID,
			IdempotencyKey: "live-1",
		})
		if !errors.Is(err, application.ErrNotFound) {
			t.Fatalf("expected ErrNotFound for invalid BranchID, got: %v", err)
		}

		// Invalid WindowID
		_, err = p.CreateLiveTicket(ctx, application.CreateLiveTicketCommand{
			BranchID:       validUUID,
			WindowID:       "invalid-uuid",
			ServiceID:      validUUID,
			IdempotencyKey: "live-1",
		})
		if !errors.Is(err, application.ErrNotFound) {
			t.Fatalf("expected ErrNotFound for invalid WindowID, got: %v", err)
		}

		// Invalid ServiceID
		_, err = p.CreateLiveTicket(ctx, application.CreateLiveTicketCommand{
			BranchID:       validUUID,
			WindowID:       validUUID,
			ServiceID:      "invalid-uuid",
			IdempotencyKey: "live-1",
		})
		if !errors.Is(err, application.ErrNotFound) {
			t.Fatalf("expected ErrNotFound for invalid ServiceID, got: %v", err)
		}

		// Empty IdempotencyKey
		_, err = p.CreateLiveTicket(ctx, application.CreateLiveTicketCommand{
			BranchID:       validUUID,
			WindowID:       validUUID,
			ServiceID:      validUUID,
			IdempotencyKey: "",
		})
		if !errors.Is(err, application.ErrInvalidState) {
			t.Fatalf("expected ErrInvalidState for empty IdempotencyKey, got: %v", err)
		}

		// Whitespace IdempotencyKey
		_, err = p.CreateLiveTicket(ctx, application.CreateLiveTicketCommand{
			BranchID:       validUUID,
			WindowID:       validUUID,
			ServiceID:      validUUID,
			IdempotencyKey: "   ",
		})
		if !errors.Is(err, application.ErrInvalidState) {
			t.Fatalf("expected ErrInvalidState for whitespace IdempotencyKey, got: %v", err)
		}
	})

	t.Run("CancelTicket", func(t *testing.T) {
		// Invalid TicketID
		_, err := p.CancelTicket(ctx, "invalid-uuid")
		if !errors.Is(err, application.ErrNotFound) {
			t.Fatalf("expected ErrNotFound for invalid TicketID, got: %v", err)
		}
	})

	t.Run("ReturnTicket", func(t *testing.T) {
		// Invalid TicketID
		_, err := p.ReturnTicket(ctx, "invalid-uuid", validUUID)
		if !errors.Is(err, application.ErrNotFound) {
			t.Fatalf("expected ErrNotFound for invalid TicketID, got: %v", err)
		}

		// Invalid WindowID
		_, err = p.ReturnTicket(ctx, validUUID, "invalid-uuid")
		if !errors.Is(err, application.ErrNotFound) {
			t.Fatalf("expected ErrNotFound for invalid WindowID, got: %v", err)
		}
	})

	t.Run("RedirectTicket", func(t *testing.T) {
		// Invalid TicketID
		_, err := p.RedirectTicket(ctx, "invalid-uuid", validUUID, validUUID)
		if !errors.Is(err, application.ErrNotFound) {
			t.Fatalf("expected ErrNotFound for invalid TicketID, got: %v", err)
		}

		// Invalid WindowID
		_, err = p.RedirectTicket(ctx, validUUID, "invalid-uuid", validUUID)
		if !errors.Is(err, application.ErrNotFound) {
			t.Fatalf("expected ErrNotFound for invalid WindowID, got: %v", err)
		}

		// Invalid TargetServiceID
		_, err = p.RedirectTicket(ctx, validUUID, validUUID, "invalid-uuid")
		if !errors.Is(err, application.ErrNotFound) {
			t.Fatalf("expected ErrNotFound for invalid TargetServiceID, got: %v", err)
		}
	})

	t.Run("CallNext", func(t *testing.T) {
		// Invalid WindowID
		_, err := p.CallNext(ctx, "invalid-uuid")
		if !errors.Is(err, application.ErrNotFound) {
			t.Fatalf("expected ErrNotFound for invalid WindowID, got: %v", err)
		}
	})
}

func TestReplayAppointment(t *testing.T) {
	bUUID, _ := uuid("11111111-1111-1111-1111-111111111111")
	sUUID, _ := uuid("22222222-2222-2222-2222-222222222222")
	otherUUID, _ := uuid("33333333-3333-3333-3333-333333333333")
	now := time.Now().UTC().Truncate(time.Second)
	differentTime := now.Add(time.Hour)

	baseTicket := domain.Ticket{
		ID:            "44444444-4444-4444-4444-444444444444",
		BranchID:      "11111111-1111-1111-1111-111111111111",
		ServiceID:     "22222222-2222-2222-2222-222222222222",
		Source:        domain.TicketSourceAppointment,
		Status:        domain.TicketStatusScheduled,
		ScheduledTime: &now,
	}

	// Successful replay
	res, err := replayAppointment(baseTicket, bUUID, sUUID, now)
	if err != nil || !res.Replayed || res.Ticket.ID != baseTicket.ID {
		t.Fatalf("expected successful replay, got res=%+v err=%v", res, err)
	}

	// Branch mismatch
	_, err = replayAppointment(baseTicket, otherUUID, sUUID, now)
	if !errors.Is(err, application.ErrIdempotencyConflict) {
		t.Fatalf("expected ErrIdempotencyConflict on branch mismatch, got: %v", err)
	}

	// Service mismatch
	_, err = replayAppointment(baseTicket, bUUID, otherUUID, now)
	if !errors.Is(err, application.ErrIdempotencyConflict) {
		t.Fatalf("expected ErrIdempotencyConflict on service mismatch, got: %v", err)
	}

	// Source mismatch
	qrTicket := baseTicket
	qrTicket.Source = domain.TicketSourceQR
	_, err = replayAppointment(qrTicket, bUUID, sUUID, now)
	if !errors.Is(err, application.ErrIdempotencyConflict) {
		t.Fatalf("expected ErrIdempotencyConflict on source mismatch, got: %v", err)
	}

	// ScheduledTime mismatch
	_, err = replayAppointment(baseTicket, bUUID, sUUID, differentTime)
	if !errors.Is(err, application.ErrIdempotencyConflict) {
		t.Fatalf("expected ErrIdempotencyConflict on time mismatch, got: %v", err)
	}

	// Nil ScheduledTime on existing ticket
	nilTimeTicket := baseTicket
	nilTimeTicket.ScheduledTime = nil
	_, err = replayAppointment(nilTimeTicket, bUUID, sUUID, now)
	if !errors.Is(err, application.ErrIdempotencyConflict) {
		t.Fatalf("expected ErrIdempotencyConflict on nil ScheduledTime, got: %v", err)
	}
}
