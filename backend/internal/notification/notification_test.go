package notification

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"postcode/backend/internal/domain"
)

type memoryOutboxRepo struct {
	mu    sync.Mutex
	items map[string]*domain.NotificationOutboxItem
}

func newMemoryOutboxRepo() *memoryOutboxRepo {
	return &memoryOutboxRepo{
		items: make(map[string]*domain.NotificationOutboxItem),
	}
}

func (r *memoryOutboxRepo) add(item domain.NotificationOutboxItem) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.items[item.ID] = &item
}

func (r *memoryOutboxRepo) FetchPendingNotifications(ctx context.Context, limit int, now time.Time) ([]domain.NotificationOutboxItem, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	var pending []domain.NotificationOutboxItem
	for _, it := range r.items {
		if it.Status == domain.NotificationStatusPending && !it.NextAttemptAt.After(now) {
			pending = append(pending, *it)
			if len(pending) >= limit {
				break
			}
		}
	}
	return pending, nil
}

func (r *memoryOutboxRepo) MarkNotificationSent(ctx context.Context, id string, sentAt time.Time) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	it, ok := r.items[id]
	if !ok {
		return fmt.Errorf("item not found: %s", id)
	}
	it.Status = domain.NotificationStatusSent
	it.SentAt = &sentAt
	it.Attempts++
	return nil
}

func (r *memoryOutboxRepo) MarkNotificationFailed(ctx context.Context, id string, errStr string, nextAttempt time.Time, final bool) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	it, ok := r.items[id]
	if !ok {
		return fmt.Errorf("item not found: %s", id)
	}
	it.Attempts++
	it.LastError = &errStr
	it.NextAttemptAt = nextAttempt
	if final {
		it.Status = domain.NotificationStatusFailed
	} else {
		it.Status = domain.NotificationStatusPending
	}
	return nil
}

func (r *memoryOutboxRepo) ListNotificationOutbox(ctx context.Context, limit, offset int, status string) ([]domain.NotificationOutboxItem, int, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	var list []domain.NotificationOutboxItem
	for _, it := range r.items {
		if status == "" || string(it.Status) == status {
			list = append(list, *it)
		}
	}
	return list, len(list), nil
}

// N1. Successful delivery
func TestSuccessfulDelivery_N1(t *testing.T) {
	demo := NewDemoServer(nil)
	server := httptest.NewServer(demo.Handler())
	defer server.Close()

	sender := NewHTTPSender(server.URL+"/notify", 2*time.Second)
	repo := newMemoryOutboxRepo()
	repo.add(domain.NotificationOutboxItem{
		ID:            "msg-1",
		TicketID:      "tkt-1",
		BranchID:      "br-1",
		EventType:     domain.NotificationTicketCalled,
		Payload:       `{"id":"msg-1","ticketId":"tkt-1","publicNumber":"Q-001","windowNumber":1}`,
		Status:        domain.NotificationStatusPending,
		MaxAttempts:   3,
		NextAttemptAt: time.Now().Add(-1 * time.Second),
		CreatedAt:     time.Now(),
	})

	worker := NewOutboxWorker(repo, sender, nil, WorkerConfig{
		MaxAttempts:    3,
		InitialBackoff: 10 * time.Millisecond,
		BatchSize:      10,
	})

	processed, err := worker.ProcessOnce(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if processed != 1 {
		t.Fatalf("expected 1 processed, got %d", processed)
	}

	repo.mu.Lock()
	item := repo.items["msg-1"]
	repo.mu.Unlock()

	if item.Status != domain.NotificationStatusSent {
		t.Fatalf("expected status SENT, got %s", item.Status)
	}
	if item.SentAt == nil {
		t.Fatal("expected sentAt to be set")
	}
	if len(demo.History()) != 1 {
		t.Fatalf("expected 1 message in demo history, got %d", len(demo.History()))
	}
}

// N2. Provider unavailable (connection refused)
func TestProviderUnavailable_N2(t *testing.T) {
	// Point to closed/dead port
	sender := NewHTTPSender("http://127.0.0.1:54321/notify", 500*time.Millisecond)
	repo := newMemoryOutboxRepo()
	repo.add(domain.NotificationOutboxItem{
		ID:            "msg-unavailable",
		TicketID:      "tkt-2",
		BranchID:      "br-1",
		EventType:     domain.NotificationTicketCalled,
		Payload:       `{"id":"msg-unavailable","ticketId":"tkt-2","publicNumber":"Q-002","windowNumber":2}`,
		Status:        domain.NotificationStatusPending,
		Attempts:      0,
		MaxAttempts:   3,
		NextAttemptAt: time.Now().Add(-1 * time.Second),
	})

	worker := NewOutboxWorker(repo, sender, nil, WorkerConfig{
		MaxAttempts:    3,
		InitialBackoff: 10 * time.Millisecond,
	})

	processed, err := worker.ProcessOnce(context.Background())
	if err != nil {
		t.Fatalf("unexpected worker error: %v", err)
	}
	if processed != 1 {
		t.Fatalf("expected 1 processed item, got %d", processed)
	}

	repo.mu.Lock()
	item := repo.items["msg-unavailable"]
	repo.mu.Unlock()

	if item.Status != domain.NotificationStatusPending {
		t.Fatalf("expected status to remain PENDING for retry, got %s", item.Status)
	}
	if item.Attempts != 1 {
		t.Fatalf("expected attempts=1, got %d", item.Attempts)
	}
	if item.LastError == nil || !strings.Contains(*item.LastError, "refused") {
		t.Fatalf("expected lastError to mention refused, got %v", item.LastError)
	}
}

// N3. Timeout
func TestTimeout_N3(t *testing.T) {
	demo := NewDemoServer(nil)
	demo.SetMode(DemoModeTimeout) // causes 6s hang
	server := httptest.NewServer(demo.Handler())
	defer server.Close()

	// Short client timeout: 80ms
	sender := NewHTTPSender(server.URL+"/notify", 80*time.Millisecond)
	repo := newMemoryOutboxRepo()
	repo.add(domain.NotificationOutboxItem{
		ID:            "msg-timeout",
		TicketID:      "tkt-3",
		EventType:     domain.NotificationTicketCalled,
		Payload:       `{"id":"msg-timeout","ticketId":"tkt-3"}`,
		Status:        domain.NotificationStatusPending,
		MaxAttempts:   3,
		NextAttemptAt: time.Now().Add(-1 * time.Second),
	})

	worker := NewOutboxWorker(repo, sender, nil, WorkerConfig{
		MaxAttempts:    3,
		InitialBackoff: 10 * time.Millisecond,
	})

	processed, err := worker.ProcessOnce(context.Background())
	if err != nil {
		t.Fatalf("unexpected worker error: %v", err)
	}
	if processed != 1 {
		t.Fatalf("expected 1 processed, got %d", processed)
	}

	repo.mu.Lock()
	item := repo.items["msg-timeout"]
	repo.mu.Unlock()

	if item.Status != domain.NotificationStatusPending {
		t.Fatalf("expected status PENDING after timeout, got %s", item.Status)
	}
	if item.Attempts != 1 {
		t.Fatalf("expected attempts=1, got %d", item.Attempts)
	}
	if item.LastError == nil {
		t.Fatal("expected lastError to be set on timeout")
	}
}

// N4. Retry: first attempts fail, then provider recovers and succeeds
func TestRetry_N4(t *testing.T) {
	demo := NewDemoServer(nil)
	demo.SetMode(DemoModeFail) // Start with failure
	server := httptest.NewServer(demo.Handler())
	defer server.Close()

	sender := NewHTTPSender(server.URL+"/notify", 1*time.Second)
	repo := newMemoryOutboxRepo()
	repo.add(domain.NotificationOutboxItem{
		ID:            "msg-retry",
		TicketID:      "tkt-4",
		EventType:     domain.NotificationTicketCalled,
		Payload:       `{"id":"msg-retry","ticketId":"tkt-4"}`,
		Status:        domain.NotificationStatusPending,
		MaxAttempts:   3,
		NextAttemptAt: time.Now().Add(-1 * time.Second),
	})

	worker := NewOutboxWorker(repo, sender, nil, WorkerConfig{
		MaxAttempts:    3,
		InitialBackoff: 5 * time.Millisecond,
	})

	// Attempt 1 fails
	_, _ = worker.ProcessOnce(context.Background())
	repo.mu.Lock()
	if repo.items["msg-retry"].Attempts != 1 || repo.items["msg-retry"].Status != domain.NotificationStatusPending {
		t.Fatalf("attempt 1: expected attempts=1, status PENDING, got %d, %s", repo.items["msg-retry"].Attempts, repo.items["msg-retry"].Status)
	}
	// Reset nextAttempt for immediate retry in test
	repo.items["msg-retry"].NextAttemptAt = time.Now().Add(-1 * time.Second)
	repo.mu.Unlock()

	// Provider recovers! Switch to SUCCESS
	demo.SetMode(DemoModeSuccess)

	// Attempt 2 succeeds
	_, _ = worker.ProcessOnce(context.Background())
	repo.mu.Lock()
	item := repo.items["msg-retry"]
	repo.mu.Unlock()

	if item.Status != domain.NotificationStatusSent {
		t.Fatalf("attempt 2: expected status SENT, got %s", item.Status)
	}
	if item.Attempts != 2 {
		t.Fatalf("expected attempts=2, got %d", item.Attempts)
	}
}

// N5. Max retries exhausted -> marks FAILED
func TestMaxRetries_N5(t *testing.T) {
	demo := NewDemoServer(nil)
	demo.SetMode(DemoModeFail)
	server := httptest.NewServer(demo.Handler())
	defer server.Close()

	sender := NewHTTPSender(server.URL+"/notify", 1*time.Second)
	repo := newMemoryOutboxRepo()
	repo.add(domain.NotificationOutboxItem{
		ID:            "msg-exhaust",
		TicketID:      "tkt-5",
		EventType:     domain.NotificationTicketCalled,
		Payload:       `{"id":"msg-exhaust","ticketId":"tkt-5"}`,
		Status:        domain.NotificationStatusPending,
		Attempts:      2, // Already failed twice
		MaxAttempts:   3,
		NextAttemptAt: time.Now().Add(-1 * time.Second),
	})

	worker := NewOutboxWorker(repo, sender, nil, WorkerConfig{
		MaxAttempts:    3,
		InitialBackoff: 5 * time.Millisecond,
	})

	// Third attempt fails -> reaches max_attempts
	_, _ = worker.ProcessOnce(context.Background())

	repo.mu.Lock()
	item := repo.items["msg-exhaust"]
	repo.mu.Unlock()

	if item.Status != domain.NotificationStatusFailed {
		t.Fatalf("expected status FAILED after exhausting retries, got %s", item.Status)
	}
	if item.Attempts != 3 {
		t.Fatalf("expected attempts=3, got %d", item.Attempts)
	}
	if item.LastError == nil {
		t.Fatal("expected lastError to record failure cause")
	}
}

// N6. Restart / persistence: pending item survives and is processed by new worker
func TestRestartPersistence_N6(t *testing.T) {
	demo := NewDemoServer(nil)
	server := httptest.NewServer(demo.Handler())
	defer server.Close()

	repo := newMemoryOutboxRepo()
	repo.add(domain.NotificationOutboxItem{
		ID:            "msg-persisted",
		TicketID:      "tkt-6",
		EventType:     domain.NotificationTicketCalled,
		Payload:       `{"id":"msg-persisted","ticketId":"tkt-6"}`,
		Status:        domain.NotificationStatusPending,
		MaxAttempts:   3,
		NextAttemptAt: time.Now().Add(-1 * time.Second),
	})

	// Worker 1 starts, processes nothing because cancelled
	ctx1, cancel1 := context.WithCancel(context.Background())
	cancel1()
	sender := NewHTTPSender(server.URL+"/notify", 1*time.Second)
	w1 := NewOutboxWorker(repo, sender, nil, DefaultWorkerConfig())
	_, _ = w1.ProcessOnce(ctx1)

	// Item is still PENDING in repo
	repo.mu.Lock()
	if repo.items["msg-persisted"].Status != domain.NotificationStatusPending {
		t.Fatal("expected item to remain PENDING")
	}
	repo.mu.Unlock()

	// New Worker 2 boots up after "restart"
	w2 := NewOutboxWorker(repo, sender, nil, DefaultWorkerConfig())
	processed, err := w2.ProcessOnce(context.Background())
	if err != nil {
		t.Fatalf("worker 2 error: %v", err)
	}
	if processed != 1 {
		t.Fatalf("expected worker 2 to process 1 item, got %d", processed)
	}

	repo.mu.Lock()
	if repo.items["msg-persisted"].Status != domain.NotificationStatusSent {
		t.Fatalf("expected status SENT, got %s", repo.items["msg-persisted"].Status)
	}
	repo.mu.Unlock()
}

// N7. Idempotency: duplicate delivery with same notification ID is accepted safely
func TestIdempotency_N7(t *testing.T) {
	demo := NewDemoServer(nil)
	server := httptest.NewServer(demo.Handler())
	defer server.Close()

	sender := NewHTTPSender(server.URL+"/notify", 1*time.Second)
	msg := domain.NotificationMessage{
		ID:           "idempotent-msg-1",
		TicketID:     "tkt-7",
		PublicNumber: "Q-007",
		WindowNumber: 1,
		EventType:    domain.NotificationTicketCalled,
		CreatedAt:    time.Now().UTC(),
	}

	// First delivery
	if err := sender.Send(context.Background(), msg); err != nil {
		t.Fatalf("delivery 1 failed: %v", err)
	}
	// Redelivery with same ID
	if err := sender.Send(context.Background(), msg); err != nil {
		t.Fatalf("delivery 2 failed: %v", err)
	}

	demo.mu.RLock()
	seen := demo.seenIDs["idempotent-msg-1"]
	demo.mu.RUnlock()

	if seen != 2 {
		t.Fatalf("expected duplicate delivery count 2, got %d", seen)
	}
}

// Demo server health and mode endpoints
func TestDemoServerEndpoints(t *testing.T) {
	demo := NewDemoServer(nil)
	server := httptest.NewServer(demo.Handler())
	defer server.Close()

	// GET /health
	resp, err := http.Get(server.URL + "/health")
	if err != nil || resp.StatusCode != http.StatusOK {
		t.Fatalf("health check failed: %v, status: %v", err, resp.StatusCode)
	}

	// POST /mode
	modeReq, _ := http.NewRequest(http.MethodPost, server.URL+"/mode", strings.NewReader(`{"mode":"FAIL"}`))
	modeReq.Header.Set("Content-Type", "application/json")
	resp2, err := http.DefaultClient.Do(modeReq)
	if err != nil || resp2.StatusCode != http.StatusOK {
		t.Fatalf("mode switch failed: %v, status: %v", err, resp2.StatusCode)
	}
	if demo.GetMode() != DemoModeFail {
		t.Fatalf("expected mode FAIL, got %s", demo.GetMode())
	}
}
