package persistence

import (
	"testing"

	"postcode/backend/internal/application"
	"postcode/backend/internal/domain"
)

func TestReturnRedirectImmutableAudit(t *testing.T) {
	ctx, p, _ := integration(t)
	qr := create(t, ctx, p, parcels, "audit-return")
	if _, err := p.CallNext(ctx, window1); err != nil {
		t.Fatal(err)
	}
	if _, err := p.ReturnTicket(ctx, qr.ID); err != nil {
		t.Fatal(err)
	}
	_, err := p.ReturnTicket(ctx, qr.ID)
	wantError(t, err, application.ErrInvalidState)
	e := events(t, ctx, p, qr.ID, 3)[2]
	if e.Type != domain.TicketEventReturned || *e.FromStatus != domain.TicketStatusCalled || e.ToStatus != domain.TicketStatusWaiting {
		t.Fatal(e)
	}
	if _, err = p.CallNext(ctx, window1); err != nil {
		t.Fatal(err)
	}
	if _, err = p.StartService(ctx, qr.ID); err != nil {
		t.Fatal(err)
	}
	cmd := application.RedirectTicketCommand{TicketID: qr.ID, NewServiceID: payments}
	if _, err = p.RedirectTicket(ctx, cmd); err != nil {
		t.Fatal(err)
	}
	_, err = p.RedirectTicket(ctx, cmd)
	wantError(t, err, application.ErrInvalidState)
	e = events(t, ctx, p, qr.ID, 6)[5]
	if e.Type != domain.TicketEventRedirected || *e.FromStatus != domain.TicketStatusServing || e.ToStatus != domain.TicketStatusWaiting {
		t.Fatal(e)
	}
	if _, err = p.pool.Exec(ctx, `UPDATE ticket_events SET to_status='CALLED' WHERE id=$1`, e.ID); err == nil {
		t.Fatal("audit mutated")
	}
	if _, err = p.CallNext(ctx, window2); err != nil {
		t.Fatal(err)
	}
	if _, err = p.StartService(ctx, qr.ID); err != nil {
		t.Fatal(err)
	}
	if _, err = p.CompleteService(ctx, qr.ID); err != nil {
		t.Fatal(err)
	}
}
