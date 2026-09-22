package persistence

import (
	"errors"
	"testing"
	"time"

	"postcode/backend/internal/application"
	"postcode/backend/internal/domain"
)

func TestArriveAppointmentByPublicNumber(t *testing.T) {
	ctx, p, _ := integration(t)

	// 1. Create appointment
	slot := time.Now().UTC().Add(30 * time.Minute).Truncate(time.Minute)
	res, err := p.CreateAppointment(ctx, application.CreateAppointmentCommand{
		BranchID:       demoBranch,
		ServiceID:      parcels,
		IdempotencyKey: "arrive-by-pubnum-1",
		ScheduledAt:    slot,
	})
	if err != nil {
		t.Fatalf("create appointment: %v", err)
	}
	apt := res.Appointment.Ticket
	if apt.PublicNumber == "" {
		t.Fatalf("expected non-empty public number")
	}

	// 2. Arrive using public number (e.g. A-XXXXXX)
	arrived, err := p.ArriveAppointment(ctx, apt.PublicNumber)
	if err != nil {
		t.Fatalf("ArriveAppointment by public number failed: %v", err)
	}

	if arrived.Ticket.ID != apt.ID {
		t.Fatalf("expected arrived ticket ID %s, got %s", apt.ID, arrived.Ticket.ID)
	}
	if arrived.Ticket.ArrivedAt == nil {
		t.Fatalf("expected non-nil ArrivedAt in returned view")
	}

	// Verify database was actually mutated for t.ID
	var dbArrivedAt *time.Time
	err = p.pool.QueryRow(ctx, `SELECT arrived_at FROM tickets WHERE id=$1::uuid`, apt.ID).Scan(&dbArrivedAt)
	if err != nil {
		t.Fatalf("query arrived_at: %v", err)
	}
	if dbArrivedAt == nil {
		t.Fatalf("database row for ticket %s was not updated with arrived_at!", apt.ID)
	}

	// Verify ARRIVED event created exactly once
	evs := events(t, ctx, p, apt.ID, 2)
	arrivedEvents := 0
	for _, e := range evs {
		if e.Type == domain.TicketEventArrived {
			arrivedEvents++
		}
	}
	if arrivedEvents != 1 {
		t.Fatalf("expected exactly 1 ARRIVED event, got %d", arrivedEvents)
	}

	// 3. Arrive replay is idempotent
	replayed, err := p.ArriveAppointment(ctx, apt.PublicNumber)
	if err != nil {
		t.Fatalf("ArriveAppointment replay failed: %v", err)
	}
	if replayed.Ticket.ID != apt.ID {
		t.Fatalf("expected same ticket ID on replay")
	}
	evsAfterReplay := events(t, ctx, p, apt.ID, 2)
	if len(evsAfterReplay) != 2 {
		t.Fatalf("expected still exactly 2 events after replay, got %d", len(evsAfterReplay))
	}

	// 4. Invalid number returns ErrNotFound
	_, err = p.ArriveAppointment(ctx, "A-999999")
	if !errors.Is(err, application.ErrNotFound) {
		t.Fatalf("expected ErrNotFound for invalid number, got: %v", err)
	}
}
