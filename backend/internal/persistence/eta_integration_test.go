package persistence

import (
	"fmt"
	"testing"
	"time"

	"postcode/backend/internal/application"
	"postcode/backend/internal/domain"
)

func TestETAHistoryAndCanonicalPosition(t *testing.T) {
	ctx, p, _ := integration(t)
	for i := 0; i < 22; i++ {
		etaTicket := create(t, ctx, p, parcels, fmt.Sprintf("eta-%d", i))
		eta, err := p.GetTicketETA(ctx, etaTicket.ID)
		if err != nil {
			t.Fatal(err)
		}
		pos, err := p.GetQueuePosition(ctx, etaTicket.ID)
		if err != nil {
			t.Fatal(err)
		}
		if eta.Reason != pos.Reason || *eta.Position != *pos.Position || *eta.ReferenceWindow != *pos.ReferenceWindow {
			t.Fatalf("position mismatch: %+v %+v", eta, pos)
		}
		if eta.SampleSize != min(i, 20) || eta.UsedFallback != (i < 3) || *eta.EstimatedWaitSeconds != 60 || !eta.EstimatedCallAt.Equal(eta.CalculatedAt.Add(time.Minute)) {
			t.Fatalf("eta: %+v", eta)
		}
		if _, err = p.CallNext(ctx, window1); err != nil {
			t.Fatal(err)
		}
		if _, err = p.StartService(ctx, etaTicket.ID); err != nil {
			t.Fatal(err)
		}
		if _, err = p.CompleteService(ctx, etaTicket.ID); err != nil {
			t.Fatal(err)
		}
		execSQL(t, ctx, p, `UPDATE tickets SET service_started_at=completed_at-interval '120.9 seconds' WHERE id=$1::uuid`, etaTicket.ID)
		if i < 2 { execSQL(t,ctx,p,`UPDATE tickets SET service_started_at=completed_at-interval '999 seconds' WHERE id=$1::uuid`,etaTicket.ID) }
		terminal, err := p.GetTicketETA(ctx, etaTicket.ID)
		if err != nil || terminal.Reason != domain.QueuePositionNotQueued || terminal.EstimatedWaitSeconds != nil || terminal.EstimatedCallAt != nil || terminal.SampleSize != 0 || terminal.UsedFallback {
			t.Fatalf("terminal: %+v %v", terminal, err)
		}
	}
	create(t, ctx, p, parcels, "ahead-1")
	create(t, ctx, p, parcels, "ahead-2")
	third := create(t, ctx, p, parcels, "third")
	eta, err := p.GetTicketETA(ctx, third.ID)
	if err != nil || *eta.EstimatedWaitSeconds != 240 || eta.SampleSize != 20 || eta.UsedFallback {
		t.Fatalf("history: %+v %v", eta, err)
	}
	pay := create(t, ctx, p, payments, "other-service")
	eta, err = p.GetTicketETA(ctx, pay.ID)
	if err != nil || eta.SampleSize != 0 || !eta.UsedFallback {
		t.Fatalf("service isolation: %+v %v", eta, err)
	}
	appointment, err := p.CreateAppointment(ctx, application.CreateAppointmentCommand{BranchID: demoBranch, ServiceID: parcels, ScheduledAt: time.Now().Add(time.Hour), IdempotencyKey: "future-eta"})
	if err != nil {
		t.Fatal(err)
	}
	eta, err = p.GetTicketETA(ctx, appointment.Appointment.Ticket.ID)
	if err != nil || eta.Reason != domain.QueuePositionNotEligibleYet || eta.EstimatedWaitSeconds != nil || eta.UsedFallback {
		t.Fatalf("future: %+v %v", eta, err)
	}
	execSQL(t, ctx, p, `UPDATE windows SET status='CLOSED'`)
	eta, err = p.GetTicketETA(ctx, third.ID)
	if err != nil || eta.Reason != domain.QueuePositionNoOpenCompatibleWindow || eta.EstimatedCallAt != nil {
		t.Fatalf("closed: %+v %v", eta, err)
	}
}

func TestETAClamp(t *testing.T) {
	for _, tc := range []struct {
		position int
		average  float64
		want     int
	}{{1, 300, 60}, {3, 300, 600}, {2, 12, 60}, {100, 300, 1800}, {4, 140, 420}} {
		if got := etaWait(tc.position, tc.average); got != tc.want {
			t.Fatalf("%+v: %d", tc, got)
		}
	}
}
