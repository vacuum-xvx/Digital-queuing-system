package persistence

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"postcode/backend/internal/domain"
	"postcode/backend/internal/notification"
)

// TestT8_NotificationProviderOutageVerifiesQueueReliability validates official requirement T8:
// The queue engine and ticket call lifecycle must function seamlessly even when the demo
// notification provider is completely offline or returns errors.
func TestT8_NotificationProviderOutageVerifiesQueueReliability(t *testing.T) {
	ctx, p, _ := integration(t)

	// Controlled mock HTTP server for demo provider
	var isOnline atomic.Bool
	isOnline.Store(true)

	demo := notification.NewDemoServer(nil)
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !isOnline.Load() {
			http.Error(w, "simulated demo notification provider outage", http.StatusServiceUnavailable)
			return
		}
		demo.Handler().ServeHTTP(w, r)
	})

	server := httptest.NewServer(handler)
	defer server.Close()

	sender := notification.NewHTTPSender(server.URL+"/notify", 1*time.Second)
	worker := notification.NewOutboxWorker(p, sender, nil, notification.WorkerConfig{
		PollInterval:   50 * time.Millisecond,
		InitialBackoff: 5 * time.Millisecond,
		MaxAttempts:    3,
		BatchSize:      10,
	})

	// Clean outbox before test run so historical items don't interfere
	_, _ = p.pool.Exec(ctx, "DELETE FROM notification_outbox")

	// Step 1: Create a WAITING ticket
	tkt := create(t, ctx, p, parcels, "t8-ticket-"+time.Now().Format("150405.000000"))
	if tkt.Status != domain.TicketStatusWaiting {
		t.Fatalf("expected initial ticket status WAITING, got: %s", tkt.Status)
	}

	// Step 2: Open compatible window
	_, err := p.ChangeWindowStatus(ctx, window1, domain.WindowStatusOpen)
	if err != nil {
		t.Fatalf("open window failed: %v", err)
	}

	// Step 3: Stop / disable demo notification service (OUTAGE SIMULATION)
	isOnline.Store(false)

	// Step 4: CallNext while notification provider is DOWN
	called, err := p.CallNext(ctx, window1)
	if err != nil {
		t.Fatalf("CallNext must succeed even if notification provider is offline, got err: %v", err)
	}

	// Step 5: Assert queue integrity
	if called.ID != tkt.ID {
		t.Fatalf("expected called ticket %s, got %s", tkt.ID, called.ID)
	}
	if called.Status != domain.TicketStatusCalled {
		t.Fatalf("expected ticket status CALLED, got: %s", called.Status)
	}
	if called.Window == nil || called.Window.ID != window1 {
		t.Fatalf("expected window assignment to %s, got: %v", window1, called.Window)
	}

	// Verify append-only audit log contains CALLED event
	events, err := p.ListTicketEvents(ctx, tkt.ID)
	if err != nil {
		t.Fatalf("failed to list ticket events: %v", err)
	}
	var hasCallEvent bool
	for _, ev := range events {
		if ev.Type == domain.TicketEventCalled && ev.ToStatus == domain.TicketStatusCalled {
			hasCallEvent = true
			break
		}
	}
	if !hasCallEvent {
		t.Fatal("expected CALLED event in ticket_events audit log")
	}

	// Verify notification outbox has recorded the pending notification
	outboxItems, total, err := p.ListNotificationOutbox(ctx, 10, 0, "")
	if err != nil {
		t.Fatalf("failed to list notification outbox: %v", err)
	}
	if total != 1 || len(outboxItems) != 1 {
		t.Fatalf("expected 1 outbox item, got total=%d len=%d", total, len(outboxItems))
	}
	item := outboxItems[0]
	if item.TicketID != tkt.ID {
		t.Fatalf("expected outbox ticket_id %s, got %s", tkt.ID, item.TicketID)
	}
	if item.Status != domain.NotificationStatusPending {
		t.Fatalf("expected outbox status PENDING, got %s", item.Status)
	}

	// Step 6: Worker attempts delivery during outage -> delivery fails, records error, increments attempts
	processed, err := worker.ProcessOnce(ctx)
	if err != nil {
		t.Fatalf("worker error: %v", err)
	}
	if processed != 1 {
		t.Fatalf("expected worker to process 1 item, got %d", processed)
	}

	// Recheck outbox after failed attempt
	outboxAfterFail, _, _ := p.ListNotificationOutbox(ctx, 10, 0, "")
	failedItem := outboxAfterFail[0]
	if failedItem.Attempts != 1 {
		t.Fatalf("expected attempts=1, got %d", failedItem.Attempts)
	}
	if failedItem.Status != domain.NotificationStatusPending {
		t.Fatalf("expected status to remain PENDING for retry, got: %s", failedItem.Status)
	}
	if failedItem.LastError == nil || !strings.Contains(*failedItem.LastError, "503") {
		t.Fatalf("expected last_error to mention 503, got: %v", failedItem.LastError)
	}

	// Assert ticket state remains 100% stable in DB
	reloadedTicket, err := p.GetTicket(ctx, tkt.ID)
	if err != nil {
		t.Fatal(err)
	}
	if reloadedTicket.Status != domain.TicketStatusCalled || reloadedTicket.Window == nil || reloadedTicket.Window.ID != window1 {
		t.Fatalf("ticket corrupted after notification failure: status=%s window=%v", reloadedTicket.Status, reloadedTicket.Window)
	}

	// Step 7: RESTORE notification service
	isOnline.Store(true)

	// Reset next_attempt_at in DB for immediate pickup in test
	_, _ = p.pool.Exec(ctx, `UPDATE notification_outbox SET next_attempt_at = clock_timestamp() WHERE id = $1::uuid`, failedItem.ID)

	// Step 8: Worker retries delivery -> delivery SUCCEEDS!
	processed2, err := worker.ProcessOnce(ctx)
	if err != nil {
		t.Fatalf("worker retry error: %v", err)
	}
	if processed2 != 1 {
		t.Fatalf("expected 1 item processed on retry, got %d", processed2)
	}

	// Recheck outbox: now SENT!
	outboxAfterSuccess, _, _ := p.ListNotificationOutbox(ctx, 10, 0, "")
	sentItem := outboxAfterSuccess[0]
	if sentItem.Status != domain.NotificationStatusSent {
		t.Fatalf("expected status SENT after recovery, got: %s", sentItem.Status)
	}
	if sentItem.SentAt == nil {
		t.Fatal("expected sent_at timestamp to be set")
	}

	// Verify ticket is STILL CALLED with window1, untouched
	finalTicket, err := p.GetTicket(ctx, tkt.ID)
	if err != nil {
		t.Fatal(err)
	}
	if finalTicket.Status != domain.TicketStatusCalled || finalTicket.Window.ID != window1 {
		t.Fatalf("final ticket state mismatch: status=%s window=%v", finalTicket.Status, finalTicket.Window)
	}

	// Verify demo service received message exactly once
	if len(demo.History()) != 1 {
		t.Fatalf("expected demo provider to have received 1 message, got %d", len(demo.History()))
	}
}
