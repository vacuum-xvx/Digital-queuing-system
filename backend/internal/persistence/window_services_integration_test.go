package persistence

import (
	"context"
	"testing"

	"postcode/backend/internal/application"
)

// serviceSend is enabled for the demo branch by the UI services migration.
const serviceSend = "33333333-2222-2222-2222-222222222222"

// TestWindowServicesCapabilitySet covers the persisted window_services capability set.
// The set is the source of truth for call-next eligibility: while it lived only in the
// browser, a window kept serving by the stale set and the next overview poll reverted
// the operator's change ("окна живут своей жизнью").
func TestWindowServicesCapabilitySet(t *testing.T) {
	ctx, p, _ := integration(t)

	wnd, err := p.UpdateWindowServices(ctx, application.UpdateWindowServicesCommand{
		WindowID:   window3,
		ServiceIDs: []string{payments, parcels},
	})
	if err != nil || wnd.ID != window3 || len(wnd.Services) != 2 {
		t.Fatalf("update=%+v err=%v", wnd, err)
	}
	// ListBranchWindows orders capabilities by service code.
	if wnd.Services[0].Code != "PARCELS" || wnd.Services[1].Code != "PAYMENTS" {
		t.Fatalf("capabilities=%+v", wnd.Services)
	}

	// The persisted set decides eligibility: window 3 no longer serves SEND.
	create(t, ctx, p, serviceSend, "ws-send")
	_, err = p.CallNext(ctx, window3)
	wantError(t, err, application.ErrNoEligibleTickets)

	// A ticket of an enabled service is claimable and pins its capability.
	pay := create(t, ctx, p, payments, "ws-pay")
	called, err := p.CallNext(ctx, window3)
	if err != nil || called.ID != pay.ID || called.Window == nil || called.Window.Number != 3 {
		t.Fatalf("call next=%+v err=%v", called, err)
	}
	// tickets(window_id, service_id) references window_services, so the capability of a
	// ticket that already visited this window cannot be dropped (frozen Sprint #1
	// schema) — the boundary reports a conflict instead of a driver error.
	_, err = p.UpdateWindowServices(ctx, application.UpdateWindowServicesCommand{
		WindowID:   window3,
		ServiceIDs: []string{parcels},
	})
	wantError(t, err, application.ErrInvalidState)
	// A rejected update must not leave a partially replaced capability set behind.
	if codes := windowCodes(t, ctx, p, window3); len(codes) != 2 || codes[0] != "PARCELS" || codes[1] != "PAYMENTS" {
		t.Fatalf("capabilities after rejected update=%v", codes)
	}

	// SEND never visited this window, so the capability can be granted again.
	updated, err := p.UpdateWindowServices(ctx, application.UpdateWindowServicesCommand{
		WindowID:   window3,
		ServiceIDs: []string{serviceSend, payments, parcels},
	})
	if err != nil || len(updated.Services) != 3 {
		t.Fatalf("update=%+v err=%v", updated, err)
	}
	if codes := windowCodes(t, ctx, p, window3); len(codes) != 3 || codes[0] != "PARCELS" || codes[1] != "PAYMENTS" || codes[2] != "SEND" {
		t.Fatalf("capabilities=%v", codes)
	}

	// Boundary validation: the set is required, ids must resolve, window must exist.
	_, err = p.UpdateWindowServices(ctx, application.UpdateWindowServicesCommand{WindowID: window3})
	wantError(t, err, application.ErrInvalidState)
	_, err = p.UpdateWindowServices(ctx, application.UpdateWindowServicesCommand{
		WindowID:   window3,
		ServiceIDs: []string{missing},
	})
	wantError(t, err, application.ErrNotFound)
	_, err = p.UpdateWindowServices(ctx, application.UpdateWindowServicesCommand{
		WindowID:   missing,
		ServiceIDs: []string{parcels},
	})
	wantError(t, err, application.ErrNotFound)
	// A service that is not enabled for the branch cannot become a capability.
	_, err = p.UpdateWindowServices(ctx, application.UpdateWindowServicesCommand{
		WindowID:   window1,
		ServiceIDs: []string{parcels, serviceSend, missing},
	})
	wantError(t, err, application.ErrNotFound)
}

// windowCodes returns the service codes of a persisted window, ordered by code.
func windowCodes(t *testing.T, ctx context.Context, p *Postgres, windowID string) []string {
	t.Helper()
	windows, err := p.ListBranchWindows(ctx, demoBranch)
	if err != nil {
		t.Fatal(err)
	}
	for _, w := range windows {
		if w.ID == windowID {
			codes := make([]string, 0, len(w.Services))
			for _, s := range w.Services {
				codes = append(codes, s.Code)
			}
			return codes
		}
	}
	t.Fatalf("window %s not found", windowID)
	return nil
}
