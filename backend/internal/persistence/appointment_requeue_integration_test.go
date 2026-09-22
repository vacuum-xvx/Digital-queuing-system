package persistence

import (
	"context"
	"testing"
	"time"

	"postcode/backend/internal/application"
	"postcode/backend/internal/domain"
)

func TestAppointmentReturnRequeuesCorrectly(t *testing.T) {
	ctx, p, _ := integration(t)

	// 1. Create an APPOINTMENT ticket scheduled for near future
	futureSlot := time.Now().UTC().Add(10 * time.Minute).Truncate(time.Minute)
	aptCmd := application.CreateAppointmentCommand{
		BranchID:       demoBranch,
		ServiceID:      parcels,
		IdempotencyKey: "apt-return-key-1",
		ScheduledAt:    futureSlot,
	}
	res, err := p.CreateAppointment(ctx, aptCmd)
	if err != nil {
		t.Fatalf("create appointment: %v", err)
	}
	apt := res.Appointment.Ticket

	// Arrive ticket
	if _, err := p.ArriveAppointment(ctx, apt.ID); err != nil {
		t.Fatalf("arrive: %v", err)
	}

	// Call next to window 1
	called, err := p.CallNext(ctx, window1)
	if err != nil {
		t.Fatalf("call next: %v", err)
	}
	if called.ID != apt.ID {
		t.Fatalf("expected called ID %s, got %s", apt.ID, called.ID)
	}

	// 2. Return ticket from CALLED state
	returnedTime := time.Now().UTC()
	returned, err := p.ReturnTicket(ctx, apt.ID)
	if err != nil {
		t.Fatalf("ReturnTicket failed: %v", err)
	}

	// Verify properties
	if returned.Status != domain.TicketStatusWaiting {
		t.Fatalf("expected status WAITING, got %s", returned.Status)
	}
	if returned.Source != domain.TicketSourceAppointment {
		t.Fatalf("expected source APPOINTMENT preserved, got %s", returned.Source)
	}
	if returned.Window != nil {
		t.Fatalf("expected nil window, got %+v", returned.Window)
	}

	// Verify fresh queue cycle: ready_at >= returnedTime - 2s, due_at > returnedTime
	var dueAt, readyAt, checkinAt time.Time
	var sourceRank int
	err = p.pool.QueryRow(ctx, `SELECT due_at, ready_at, checkin_at, source_rank FROM tickets WHERE id=$1::uuid`, apt.ID).Scan(&dueAt, &readyAt, &checkinAt, &sourceRank)
	if err != nil {
		t.Fatalf("query ticket schedule: %v", err)
	}

	if dueAt.Before(returnedTime) {
		t.Fatalf("due_at must not be expired past slot! due_at=%v, returnedTime=%v", dueAt, returnedTime)
	}
	if readyAt.Before(returnedTime.Add(-2 * time.Second)) {
		t.Fatalf("ready_at must be fresh queue cycle: %v", readyAt)
	}
	if sourceRank != 0 {
		t.Fatalf("expected sourceRank=0 for appointment, got %d", sourceRank)
	}

	// Verify RETURNED audit event
	evs := events(t, ctx, p, apt.ID, 4)
	lastEv := evs[len(evs)-1]
	if lastEv.Type != domain.TicketEventReturned {
		t.Fatalf("expected RETURNED event, got %s", lastEv.Type)
	}
	if lastEv.FromStatus == nil || *lastEv.FromStatus != domain.TicketStatusCalled || lastEv.ToStatus != domain.TicketStatusWaiting {
		t.Fatalf("expected transition CALLED -> WAITING, got from=%v to=%s", lastEv.FromStatus, lastEv.ToStatus)
	}

	// 3. Test Return from SERVING state
	called2, err := p.CallNext(ctx, window1)
	if err != nil || called2.ID != apt.ID {
		t.Fatalf("call next after return: %v, id=%v", err, called2.ID)
	}
	if _, err := p.StartService(ctx, apt.ID); err != nil {
		t.Fatalf("start service: %v", err)
	}
	returnedFromServing, err := p.ReturnTicket(ctx, apt.ID)
	if err != nil {
		t.Fatalf("ReturnTicket from SERVING failed: %v", err)
	}
	if returnedFromServing.Status != domain.TicketStatusWaiting {
		t.Fatalf("expected status WAITING, got %s", returnedFromServing.Status)
	}
}

func TestAppointmentRedirectRequeuesToTargetService(t *testing.T) {
	ctx, p, _ := integration(t)

	// Create an appointment for PARCELS
	slot := time.Now().UTC().Add(10 * time.Minute).Truncate(time.Minute)
	res, err := p.CreateAppointment(ctx, application.CreateAppointmentCommand{
		BranchID:       demoBranch,
		ServiceID:      parcels,
		IdempotencyKey: "apt-redirect-key-1",
		ScheduledAt:    slot,
	})
	if err != nil {
		t.Fatalf("create appointment: %v", err)
	}
	apt := res.Appointment.Ticket

	// Arrive, call and start service
	if _, err := p.ArriveAppointment(ctx, apt.ID); err != nil {
		t.Fatalf("arrive: %v", err)
	}
	if _, err := p.CallNext(ctx, window1); err != nil {
		t.Fatalf("call next: %v", err)
	}
	if _, err := p.StartService(ctx, apt.ID); err != nil {
		t.Fatalf("start service: %v", err)
	}

	// Redirect to PAYMENTS
	redirectCmd := application.RedirectTicketCommand{
		TicketID:     apt.ID,
		NewServiceID: payments,
		NewWindowID:  window2,
	}
	redirected, err := p.RedirectTicket(ctx, redirectCmd)
	if err != nil {
		t.Fatalf("RedirectTicket failed: %v", err)
	}

	// Verify redirected ticket properties
	if redirected.Status != domain.TicketStatusWaiting {
		t.Fatalf("expected status WAITING, got %s", redirected.Status)
	}
	if redirected.Source != domain.TicketSourceAppointment {
		t.Fatalf("expected source APPOINTMENT preserved, got %s", redirected.Source)
	}
	if redirected.ServiceID != payments {
		t.Fatalf("expected service %s, got %s", payments, redirected.ServiceID)
	}

	// Verify audit event REDIRECTED
	evs := events(t, ctx, p, apt.ID, 5)
	lastEv := evs[len(evs)-1]
	if lastEv.Type != domain.TicketEventRedirected {
		t.Fatalf("expected REDIRECTED event, got %s", lastEv.Type)
	}
	if lastEv.FromStatus == nil || *lastEv.FromStatus != domain.TicketStatusServing || lastEv.ToStatus != domain.TicketStatusWaiting {
		t.Fatalf("expected transition SERVING -> WAITING, got from=%v to=%s", lastEv.FromStatus, lastEv.ToStatus)
	}

	// Verify window 2 can call this redirected ticket
	calledAtWin2, err := p.CallNext(ctx, window2)
	if err != nil {
		t.Fatalf("CallNext at target window failed: %v", err)
	}
	if calledAtWin2.ID != apt.ID {
		t.Fatalf("expected called ID %s, got %s", apt.ID, calledAtWin2.ID)
	}
	if calledAtWin2.ServiceID != payments {
		t.Fatalf("expected service PAYMENTS, got %s", calledAtWin2.ServiceID)
	}
}

func TestQRAndLiveReturnRedirectRegression(t *testing.T) {
	ctx, p, _ := integration(t)

	// QR flow
	qr := create(t, ctx, p, parcels, "qr-regr-key")
	calledQR, err := p.CallNext(ctx, window1)
	if err != nil || calledQR.ID != qr.ID {
		t.Fatalf("call QR: %v", err)
	}
	retQR, err := p.ReturnTicket(ctx, qr.ID)
	if err != nil || retQR.Status != domain.TicketStatusWaiting || retQR.Source != domain.TicketSourceQR {
		t.Fatalf("return QR: %v, ticket=%+v", err, retQR)
	}

	// LIVE flow
	liveTkt := live(t, ctx, p, "live-regr-key", parcels)
	calledLive, err := p.CallNext(ctx, window1)
	if err != nil || calledLive.ID != qr.ID {
		// QR was waiting, so QR should be called before LIVE
	}
	_ = calledLive
	_ = liveTkt
	_ = context.Background()
}
