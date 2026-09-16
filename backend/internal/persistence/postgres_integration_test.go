package persistence

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"net/url"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"postcode/backend/internal/application"
	"postcode/backend/internal/domain"
)

const (
	demoBranch = "11111111-1111-1111-1111-111111111111"
	parcels    = "22222222-2222-2222-2222-222222222222"
	payments   = "55555555-5555-5555-5555-555555555555"
	window1    = "33333333-3333-3333-3333-333333333333"
	window2    = "44444444-4444-4444-4444-444444444444"
	window3    = "66666666-6666-6666-6666-666666666666"
	missing    = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
)

// Every test gets a private schema. Existing application data is never reset.
func integration(t *testing.T) (context.Context, *Postgres, *migrate.Migrate) {
	t.Helper()
	dsn := os.Getenv("CORE_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set CORE_TEST_DATABASE_URL to run PostgreSQL integration tests")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	t.Cleanup(cancel)
	admin, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(admin.Close)
	var nonce [12]byte
	rand.Read(nonce[:])
	schema := "core_test_" + hex.EncodeToString(nonce[:])
	if _, err = admin.Exec(ctx, `CREATE SCHEMA `+pgx.Identifier{schema}.Sanitize()); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		cleanup, c := context.WithTimeout(context.Background(), 5*time.Second)
		defer c()
		if _, err := admin.Exec(cleanup, `DROP SCHEMA `+pgx.Identifier{schema}.Sanitize()+` CASCADE`); err != nil {
			t.Error(err)
		}
	})
	u, err := url.Parse(dsn)
	if err != nil {
		t.Fatal(err)
	}
	q := u.Query()
	q.Set("search_path", schema)
	u.RawQuery = q.Encode()
	m, err := migrate.New("file://../../migrations", u.String())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		a, b := m.Close()
		if a != nil || b != nil {
			t.Errorf("migration close: %v %v", a, b)
		}
	})
	if err = m.Up(); err != nil {
		t.Fatal(err)
	}
	version, dirty, err := m.Version()
	if err != nil || version != 3 || dirty {
		t.Fatalf("migration version=%d dirty=%v err=%v", version, dirty, err)
	}
	pool, err := pgxpool.New(ctx, u.String())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	return ctx, New(pool), m
}
func create(t *testing.T, ctx context.Context, p *Postgres, service, key string) domain.Ticket {
	t.Helper()
	r, err := p.CreateQRTicket(ctx, application.CreateQRTicketCommand{BranchID: demoBranch, ServiceID: service, IdempotencyKey: key})
	if err != nil || r.Replayed {
		t.Fatalf("create: %+v %v", r, err)
	}
	return r.Ticket
}
func wantError(t *testing.T, err, want error) {
	t.Helper()
	if !errors.Is(err, want) {
		t.Fatalf("error=%v want=%v", err, want)
	}
}
func execSQL(t *testing.T, ctx context.Context, p *Postgres, sql string, args ...any) {
	t.Helper()
	if _, err := p.pool.Exec(ctx, sql, args...); err != nil {
		t.Fatal(err)
	}
}
func TestPostgresCatalogAndMigration(t *testing.T) {
	ctx, p, m := integration(t)
	branches, err := p.ListBranches(ctx)
	if err != nil || len(branches) != 1 || branches[0].ID != demoBranch || branches[0].Name != "Демо-отделение №1" {
		t.Fatalf("branches: %v %v", branches, err)
	}
	services, err := p.ListBranchServices(ctx, demoBranch)
	if err != nil || len(services) != 2 {
		t.Fatalf("services: %v %v", services, err)
	}
	windows, err := p.ListBranchWindows(ctx, demoBranch)
	if err != nil || len(windows) != 3 {
		t.Fatalf("windows: %v %v", windows, err)
	}
	for i, w := range windows {
		ids := []string{window1, window2, window3}
		codes := []string{"PARCELS", "PAYMENTS", "PARCELS"}
		if w.ID != ids[i] || w.Number != i+1 || w.Status != domain.WindowStatusOpen || len(w.Services) != 1 || w.Services[0].Code != codes[i] {
			t.Fatalf("window: %+v", w)
		}
	}
	_, err = p.ListBranchServices(ctx, missing)
	wantError(t, err, application.ErrNotFound)
	_, err = p.ListBranchWindows(ctx, missing)
	wantError(t, err, application.ErrNotFound)
	execSQL(t, ctx, p, `INSERT INTO branches VALUES($1,'Empty')`, missing)
	empty, err := p.ListBranchServices(ctx, missing)
	if err != nil || empty == nil || len(empty) != 0 {
		t.Fatalf("empty: %v %v", empty, err)
	}
	_, err = p.CreateQRTicket(ctx, application.CreateQRTicketCommand{BranchID: missing, ServiceID: parcels, IdempotencyKey: "unsupported"})
	wantError(t, err, application.ErrNotFound)
	// Capability cannot reference a service not enabled for the branch.
	execSQL(t, ctx, p, `INSERT INTO windows VALUES('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',$1,1,'OPEN')`, missing)
	if _, err = p.pool.Exec(ctx, `INSERT INTO window_services VALUES('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',$1,$2)`, missing, parcels); err == nil {
		t.Fatal("invalid capability accepted")
	}
	if err = m.Steps(-1); err != nil {
		t.Fatal(err)
	}
	version, dirty, err := m.Version()
	if err != nil || version != 2 || dirty {
		t.Fatalf("down: %d %v %v", version, dirty, err)
	}
	if err = m.Up(); err != nil {
		t.Fatal(err)
	}
}
func TestPostgresIdempotency(t *testing.T) {
	ctx, p, _ := integration(t)
	cmd := application.CreateQRTicketCommand{BranchID: demoBranch, ServiceID: parcels, IdempotencyKey: "same"}
	first := create(t, ctx, p, parcels, cmd.IdempotencyKey)
	if first.Status != domain.TicketStatusWaiting || first.Source != domain.TicketSourceQR || first.Window != nil || first.PublicNumber != "Q-000001" || first.CreatedAt.IsZero() || first.QueueEnteredAt.IsZero() {
		t.Fatalf("ticket: %+v", first)
	}
	for _, changed := range []application.CreateQRTicketCommand{
		{BranchID: demoBranch, ServiceID: payments, IdempotencyKey: "same"},
		{BranchID: missing, ServiceID: parcels, IdempotencyKey: "same"},
	} {
		_, err := p.CreateQRTicket(ctx, changed)
		wantError(t, err, application.ErrIdempotencyConflict)
	}
	r, err := p.CreateQRTicket(ctx, cmd)
	if err != nil || !r.Replayed || r.Ticket.ID != first.ID {
		t.Fatalf("replay: %+v %v", r, err)
	}
	execSQL(t, ctx, p, `UPDATE tickets SET source='LIVE' WHERE id=$1::uuid`, first.ID)
	_, err = p.CreateQRTicket(ctx, cmd)
	wantError(t, err, application.ErrIdempotencyConflict)
	for _, bad := range []application.CreateQRTicketCommand{
		{BranchID: missing, ServiceID: parcels, IdempotencyKey: "missing-branch"},
		{BranchID: demoBranch, ServiceID: missing, IdempotencyKey: "missing-service"},
	} {
		_, err = p.CreateQRTicket(ctx, bad)
		wantError(t, err, application.ErrNotFound)
	}
	cmd.IdempotencyKey = " "
	_, err = p.CreateQRTicket(ctx, cmd)
	wantError(t, err, application.ErrInvalidState)
	execSQL(t, ctx, p, `SELECT setval('ticket_public_number_seq',999999)`)
	large := create(t, ctx, p, payments, "large-number")
	if large.PublicNumber != "Q-1000000" {
		t.Fatal(large.PublicNumber)
	}
}
func TestPostgresRoutingAndTransitions(t *testing.T) {
	ctx, p, _ := integration(t)
	current, err := p.GetCurrentTicket(ctx, window1)
	if err != nil || current != nil {
		t.Fatalf("idle: %v %v", current, err)
	}
	_, err = p.GetCurrentTicket(ctx, missing)
	wantError(t, err, application.ErrNotFound)
	_, err = p.GetTicket(ctx, missing)
	wantError(t, err, application.ErrNotFound)
	_, err = p.CallNext(ctx, missing)
	wantError(t, err, application.ErrNotFound)
	a := create(t, ctx, p, parcels, "parcel-a")
	b := create(t, ctx, p, parcels, "parcel-b")
	_, err = p.CallNext(ctx, window2)
	wantError(t, err, application.ErrNoEligibleTickets)
	pay := create(t, ctx, p, payments, "payment")
	calledPay, err := p.CallNext(ctx, window2)
	if err != nil || calledPay.ID != pay.ID {
		t.Fatalf("payment routing: %v %v", calledPay, err)
	}
	// Test the UUID tie-breaker independently of insertion order.
	execSQL(t, ctx, p, `UPDATE tickets SET queue_entered_at='2026-01-01T00:00:00Z' WHERE id IN ($1::uuid,$2::uuid)`, a.ID, b.ID)
	if b.ID < a.ID {
		a, b = b, a
	}
	_, err = p.StartService(ctx, a.ID)
	wantError(t, err, application.ErrInvalidState)
	_, err = p.CompleteService(ctx, a.ID)
	wantError(t, err, application.ErrInvalidState)
	called, err := p.CallNext(ctx, window1)
	if err != nil || called.ID != a.ID || called.Status != domain.TicketStatusCalled || called.CalledAt == nil || called.Window.ID != window1 {
		t.Fatalf("called: %+v %v", called, err)
	}
	current, err = p.GetCurrentTicket(ctx, window1)
	if err != nil || current == nil || current.ID != a.ID {
		t.Fatalf("current: %v %v", current, err)
	}
	_, err = p.CallNext(ctx, window1)
	wantError(t, err, application.ErrWindowBusy)
	_, err = p.CompleteService(ctx, a.ID)
	wantError(t, err, application.ErrInvalidState)
	serving, err := p.StartService(ctx, a.ID)
	if err != nil || serving.Status != domain.TicketStatusServing || serving.ServiceStartedAt == nil {
		t.Fatalf("serving: %v %v", serving, err)
	}
	_, err = p.StartService(ctx, a.ID)
	wantError(t, err, application.ErrInvalidState)
	completed, err := p.CompleteService(ctx, a.ID)
	if err != nil || completed.Status != domain.TicketStatusCompleted || completed.CompletedAt == nil {
		t.Fatalf("complete: %v %v", completed, err)
	}
	_, err = p.CompleteService(ctx, a.ID)
	wantError(t, err, application.ErrInvalidState)
	_, err = p.StartService(ctx, a.ID)
	wantError(t, err, application.ErrInvalidState)
	current, err = p.GetCurrentTicket(ctx, window1)
	if err != nil || current != nil {
		t.Fatalf("completed current: %v %v", current, err)
	}
	next, err := p.CallNext(ctx, window1)
	if err != nil || next.ID != b.ID {
		t.Fatalf("next: %v %v", next, err)
	}
	for _, status := range []string{"CLOSED", "CLOSING"} {
		execSQL(t, ctx, p, `UPDATE windows SET status=$1 WHERE id=$2::uuid`, status, window3)
		_, err = p.CallNext(ctx, window3)
		wantError(t, err, application.ErrInvalidState)
	}
	_, err = p.StartService(ctx, missing)
	wantError(t, err, application.ErrNotFound)
	_, err = p.CompleteService(ctx, missing)
	wantError(t, err, application.ErrNotFound)
}

// Barrier starts requests together; assertions cover database outcomes, not timing.
func concurrently(n int, fn func(int)) {
	var wg sync.WaitGroup
	start := make(chan struct{})
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(i int) { defer wg.Done(); <-start; fn(i) }(i)
	}
	close(start)
	wg.Wait()
}
func TestPostgresConcurrentCreation(t *testing.T) {
	ctx, p, _ := integration(t)
	const n = 12
	results := make([]application.CreateQRTicketResult, n)
	errs := make([]error, n)
	concurrently(n, func(i int) {
		results[i], errs[i] = p.CreateQRTicket(ctx, application.CreateQRTicketCommand{BranchID: demoBranch, ServiceID: parcels, IdempotencyKey: "concurrent"})
	})
	created := 0
	for i, r := range results {
		if errs[i] != nil {
			t.Fatal(errs[i])
		}
		if !r.Replayed {
			created++
		}
		if r.Ticket.ID != results[0].Ticket.ID {
			t.Fatal("duplicate ticket")
		}
	}
	if created != 1 {
		t.Fatalf("created=%d", created)
	}
	concurrently(n, func(i int) {
		service := parcels
		if i%2 == 1 {
			service = payments
		}
		results[i], errs[i] = p.CreateQRTicket(ctx, application.CreateQRTicketCommand{BranchID: demoBranch, ServiceID: service, IdempotencyKey: "conflict-race"})
	})
	success, conflicts := 0, 0
	for _, err := range errs {
		if err == nil {
			success++
		} else if errors.Is(err, application.ErrIdempotencyConflict) {
			conflicts++
		} else {
			t.Fatal(err)
		}
	}
	if success != n/2 || conflicts != n/2 {
		t.Fatalf("success=%d conflicts=%d", success, conflicts)
	}
}
func TestPostgresConcurrentClaims(t *testing.T) {
	ctx, p, _ := integration(t)
	ticket := create(t, ctx, p, parcels, "one")
	var results [2]domain.Ticket
	var errs [2]error
	concurrently(2, func(i int) { results[i], errs[i] = p.CallNext(ctx, []string{window1, window3}[i]) })
	successes := 0
	var winner string
	for i, err := range errs {
		if err == nil {
			successes++
			winner = results[i].Window.ID
			if results[i].ID != ticket.ID {
				t.Fatal("wrong ticket")
			}
		} else {
			wantError(t, err, application.ErrNoEligibleTickets)
		}
	}
	if successes != 1 {
		t.Fatalf("assigned %d times", successes)
	}
	create(t, ctx, p, parcels, "second")
	// The partial unique index protects writes even outside CallNext.
	if _, err := p.pool.Exec(ctx, `UPDATE tickets SET status='CALLED',window_id=$1::uuid,called_at=now() WHERE idempotency_key='second'`, winner); err == nil {
		t.Fatal("two active tickets accepted")
	}
	concurrently(2, func(i int) { results[i], errs[i] = p.StartService(ctx, ticket.ID) })
	successes = 0
	for _, err := range errs {
		if err == nil {
			successes++
		} else {
			wantError(t, err, application.ErrInvalidState)
		}
	}
	if successes != 1 {
		t.Fatal("start silently overwritten")
	}
	concurrently(2, func(i int) { results[i], errs[i] = p.CompleteService(ctx, ticket.ID) })
	successes = 0
	for _, err := range errs {
		if err == nil {
			successes++
		} else {
			wantError(t, err, application.ErrInvalidState)
		}
	}
	if successes != 1 {
		t.Fatal("complete silently overwritten")
	}
	create(t, ctx, p, parcels, "third")
	concurrently(2, func(i int) { results[i], errs[i] = p.CallNext(ctx, winner) })
	successes = 0
	for _, err := range errs {
		if err == nil {
			successes++
		} else {
			wantError(t, err, application.ErrWindowBusy)
		}
	}
	if successes != 1 {
		t.Fatal("window has multiple active tickets")
	}
}

func TestPostgresFIFOAndSkipLocked(t *testing.T) {
	ctx, p, _ := integration(t)
	a := create(t, ctx, p, parcels, "first")
	b := create(t, ctx, p, parcels, "second")
	execSQL(t, ctx, p, `UPDATE tickets SET queue_entered_at='2026-01-01T00:00:00Z' WHERE id=$1::uuid`, a.ID)
	execSQL(t, ctx, p, `UPDATE tickets SET queue_entered_at='2026-01-02T00:00:00Z' WHERE id=$1::uuid`, b.ID)
	// An earlier ticket of the same global service in another branch is ineligible.
	execSQL(t, ctx, p, `INSERT INTO branches VALUES($1,'Other')`, missing)
	execSQL(t, ctx, p, `INSERT INTO branch_services VALUES($1,$2)`, missing, parcels)
	other, err := p.CreateQRTicket(ctx, application.CreateQRTicketCommand{BranchID: missing, ServiceID: parcels, IdempotencyKey: "other-branch"})
	if err != nil {
		t.Fatal(err)
	}
	execSQL(t, ctx, p, `UPDATE tickets SET queue_entered_at='2025-01-01T00:00:00Z' WHERE id=$1::uuid`, other.Ticket.ID)
	locker, err := p.pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer locker.Rollback(context.Background())
	if _, err = locker.Exec(ctx, `SELECT id FROM tickets WHERE id=$1::uuid FOR UPDATE`, a.ID); err != nil {
		t.Fatal(err)
	}
	callCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	claimed, err := p.CallNext(callCtx, window1)
	if err != nil || claimed.ID != b.ID {
		t.Fatalf("skip locked: %+v %v", claimed, err)
	}
	if err = locker.Rollback(ctx); err != nil {
		t.Fatal(err)
	}
	claimed, err = p.CallNext(ctx, window3)
	if err != nil || claimed.ID != a.ID {
		t.Fatalf("earliest unlocked: %+v %v", claimed, err)
	}
	untouched, err := p.GetTicket(ctx, other.Ticket.ID)
	if err != nil || untouched.Status != domain.TicketStatusWaiting {
		t.Fatalf("other branch: %+v %v", untouched, err)
	}
}

func TestPostgresConcurrentDistinctClaims(t *testing.T) {
	ctx, p, _ := integration(t)
	a := create(t, ctx, p, parcels, "first")
	b := create(t, ctx, p, parcels, "second")
	var results [2]domain.Ticket
	var errs [2]error
	concurrently(2, func(i int) { results[i], errs[i] = p.CallNext(ctx, []string{window1, window3}[i]) })
	for _, err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}
	if results[0].ID == results[1].ID {
		t.Fatal("same ticket claimed twice")
	}
	for _, r := range results {
		if r.ID != a.ID && r.ID != b.ID {
			t.Fatal("unexpected ticket")
		}
	}
}

func TestPostgresAppointment(t *testing.T) {
	ctx, p, _ := integration(t)
	schedTime := time.Now().UTC().Add(30 * time.Minute).Truncate(time.Second)
	cmd := application.CreateAppointmentCommand{
		BranchID:       demoBranch,
		ServiceID:      parcels,
		ScheduledTime:  schedTime,
		IdempotencyKey: "apt-1",
	}
	res, err := p.CreateAppointment(ctx, cmd)
	if err != nil {
		t.Fatalf("create appointment: %v", err)
	}
	if res.Replayed {
		t.Fatal("expected not replayed")
	}
	ticket := res.Ticket
	if ticket.Source != domain.TicketSourceAppointment || ticket.Status != domain.TicketStatusScheduled {
		t.Fatalf("unexpected ticket source/status: %+v", ticket)
	}
	if ticket.ScheduledTime == nil || !ticket.ScheduledTime.Equal(schedTime) {
		t.Fatalf("expected scheduled_time %v, got %v", schedTime, ticket.ScheduledTime)
	}

	// Idempotent replay
	replayRes, err := p.CreateAppointment(ctx, cmd)
	if err != nil || !replayRes.Replayed || replayRes.Ticket.ID != ticket.ID {
		t.Fatalf("expected idempotent replay: %+v %v", replayRes, err)
	}

	// Conflict replay with different scheduled time
	conflictCmd := cmd
	conflictCmd.ScheduledTime = schedTime.Add(15 * time.Minute)
	_, err = p.CreateAppointment(ctx, conflictCmd)
	wantError(t, err, application.ErrIdempotencyConflict)

	// Conflict replay with different service
	conflictCmd = cmd
	conflictCmd.ServiceID = payments
	_, err = p.CreateAppointment(ctx, conflictCmd)
	wantError(t, err, application.ErrIdempotencyConflict)

	// Unsupported service
	_, err = p.CreateAppointment(ctx, application.CreateAppointmentCommand{
		BranchID:       demoBranch,
		ServiceID:      missing,
		ScheduledTime:  schedTime,
		IdempotencyKey: "apt-unsupported",
	})
	wantError(t, err, application.ErrNotFound)
}

func TestPostgresLiveTicket(t *testing.T) {
	ctx, p, _ := integration(t)
	cmd := application.CreateLiveTicketCommand{
		BranchID:       demoBranch,
		WindowID:       window1,
		ServiceID:      parcels,
		IdempotencyKey: "live-1",
	}
	ticket, err := p.CreateLiveTicket(ctx, cmd)
	if err != nil {
		t.Fatalf("create live ticket: %v", err)
	}
	if ticket.Source != domain.TicketSourceLive || ticket.Status != domain.TicketStatusWaiting {
		t.Fatalf("unexpected ticket source/status: %+v", ticket)
	}
	if ticket.Window != nil {
		t.Fatalf("expected window to be nil for WAITING ticket: %+v", ticket.Window)
	}

	// Replay
	replayed, err := p.CreateLiveTicket(ctx, cmd)
	if err != nil || replayed.ID != ticket.ID {
		t.Fatalf("expected replay of live ticket: %+v %v", replayed, err)
	}

	// Conflict on key
	conflictCmd := cmd
	conflictCmd.ServiceID = payments
	_, err = p.CreateLiveTicket(ctx, conflictCmd)
	wantError(t, err, application.ErrIdempotencyConflict)

	// Window does not support service (window1 supports PARCELS, not PAYMENTS)
	_, err = p.CreateLiveTicket(ctx, application.CreateLiveTicketCommand{
		BranchID:       demoBranch,
		WindowID:       window1,
		ServiceID:      payments,
		IdempotencyKey: "live-unsupported",
	})
	wantError(t, err, application.ErrNotFound)

	// Window closed
	execSQL(t, ctx, p, `UPDATE windows SET status='CLOSED' WHERE id=$1::uuid`, window3)
	_, err = p.CreateLiveTicket(ctx, application.CreateLiveTicketCommand{
		BranchID:       demoBranch,
		WindowID:       window3,
		ServiceID:      parcels,
		IdempotencyKey: "live-closed",
	})
	wantError(t, err, application.ErrInvalidState)
}

func TestPostgresCancelTicket(t *testing.T) {
	ctx, p, _ := integration(t)

	// 1. Cancel SCHEDULED
	apt, err := p.CreateAppointment(ctx, application.CreateAppointmentCommand{
		BranchID:       demoBranch,
		ServiceID:      parcels,
		ScheduledTime:  time.Now().UTC().Add(time.Hour),
		IdempotencyKey: "apt-cancel",
	})
	if err != nil {
		t.Fatal(err)
	}
	cancelledApt, err := p.CancelTicket(ctx, apt.Ticket.ID)
	if err != nil || cancelledApt.Status != domain.TicketStatusCancelled {
		t.Fatalf("cancel scheduled: %+v %v", cancelledApt, err)
	}

	// Cannot cancel already cancelled
	_, err = p.CancelTicket(ctx, apt.Ticket.ID)
	wantError(t, err, application.ErrInvalidState)

	// 2. Cancel WAITING
	waiting := create(t, ctx, p, parcels, "wait-cancel")
	cancelledWaiting, err := p.CancelTicket(ctx, waiting.ID)
	if err != nil || cancelledWaiting.Status != domain.TicketStatusCancelled {
		t.Fatalf("cancel waiting: %+v %v", cancelledWaiting, err)
	}

	// 3. Cancel CALLED (frees window)
	calledTicket := create(t, ctx, p, parcels, "call-cancel")
	called, err := p.CallNext(ctx, window1)
	if err != nil || called.ID != calledTicket.ID {
		t.Fatalf("call: %+v %v", called, err)
	}
	cancelledCalled, err := p.CancelTicket(ctx, called.ID)
	if err != nil || cancelledCalled.Status != domain.TicketStatusCancelled || cancelledCalled.Window != nil {
		t.Fatalf("cancel called: %+v %v", cancelledCalled, err)
	}
	// Window is now free!
	current, err := p.GetCurrentTicket(ctx, window1)
	if err != nil || current != nil {
		t.Fatalf("expected window to be free: %v %v", current, err)
	}

	// 4. Cannot cancel SERVING
	servingTicket := create(t, ctx, p, parcels, "serv-cancel")
	called, err = p.CallNext(ctx, window1)
	if err != nil {
		t.Fatal(err)
	}
	_, err = p.StartService(ctx, called.ID)
	if err != nil {
		t.Fatal(err)
	}
	_, err = p.CancelTicket(ctx, servingTicket.ID)
	wantError(t, err, application.ErrInvalidState)

	// Complete it, cannot cancel COMPLETED
	_, err = p.CompleteService(ctx, servingTicket.ID)
	if err != nil {
		t.Fatal(err)
	}
	_, err = p.CancelTicket(ctx, servingTicket.ID)
	wantError(t, err, application.ErrInvalidState)

	// Cancel missing ticket
	_, err = p.CancelTicket(ctx, missing)
	wantError(t, err, application.ErrNotFound)
}

func TestPostgresReturnTicket(t *testing.T) {
	ctx, p, _ := integration(t)

	// Cannot return ticket in WAITING state
	waiting := create(t, ctx, p, parcels, "wait-ret")
	_, err := p.ReturnTicket(ctx, waiting.ID, window1)
	wantError(t, err, application.ErrInvalidState)

	// Call ticket at window 1
	called, err := p.CallNext(ctx, window1)
	if err != nil || called.ID != waiting.ID {
		t.Fatalf("call: %+v %v", called, err)
	}

	// Wrong window returns ErrInvalidState
	_, err = p.ReturnTicket(ctx, called.ID, window2)
	wantError(t, err, application.ErrInvalidState)

	// Return ticket from window 1
	returned, err := p.ReturnTicket(ctx, called.ID, window1)
	if err != nil || returned.Status != domain.TicketStatusWaiting || returned.Window != nil {
		t.Fatalf("return ticket: %+v %v", returned, err)
	}
	if !returned.QueueEnteredAt.Equal(waiting.QueueEnteredAt) {
		t.Fatalf("queue_entered_at changed: was %v, now %v", waiting.QueueEnteredAt, returned.QueueEnteredAt)
	}

	// Window 1 is now free
	current, err := p.GetCurrentTicket(ctx, window1)
	if err != nil || current != nil {
		t.Fatalf("window should be free: %v %v", current, err)
	}

	// Can return ticket in SERVING state too
	calledAgain, err := p.CallNext(ctx, window1)
	if err != nil || calledAgain.ID != waiting.ID {
		t.Fatalf("call again: %+v %v", calledAgain, err)
	}
	_, err = p.StartService(ctx, calledAgain.ID)
	if err != nil {
		t.Fatal(err)
	}
	returnedFromServing, err := p.ReturnTicket(ctx, calledAgain.ID, window1)
	if err != nil || returnedFromServing.Status != domain.TicketStatusWaiting || returnedFromServing.Window != nil {
		t.Fatalf("return from serving: %+v %v", returnedFromServing, err)
	}
}

func TestPostgresRedirectTicket(t *testing.T) {
	ctx, p, _ := integration(t)

	// Call ticket at window 1 (PARCELS)
	tk := create(t, ctx, p, parcels, "tk-redir")
	called, err := p.CallNext(ctx, window1)
	if err != nil || called.ID != tk.ID {
		t.Fatalf("call: %+v %v", called, err)
	}

	// Wrong window returns ErrInvalidState
	_, err = p.RedirectTicket(ctx, called.ID, window2, payments)
	wantError(t, err, application.ErrInvalidState)

	// Redirect to unsupported service returns ErrNotFound
	_, err = p.RedirectTicket(ctx, called.ID, window1, missing)
	wantError(t, err, application.ErrNotFound)

	// Redirect from window 1 to PAYMENTS
	redirected, err := p.RedirectTicket(ctx, called.ID, window1, payments)
	if err != nil || redirected.Status != domain.TicketStatusWaiting || redirected.ServiceID != payments || redirected.Window != nil {
		t.Fatalf("redirect: %+v %v", redirected, err)
	}
	if !redirected.QueueEnteredAt.Equal(tk.QueueEnteredAt) {
		t.Fatalf("queue_entered_at changed: was %v, now %v", tk.QueueEnteredAt, redirected.QueueEnteredAt)
	}

	// Window 1 is now free
	current, err := p.GetCurrentTicket(ctx, window1)
	if err != nil || current != nil {
		t.Fatalf("window 1 should be free: %v %v", current, err)
	}

	// Window 2 (PAYMENTS) can now call the redirected ticket
	calledAtWin2, err := p.CallNext(ctx, window2)
	if err != nil || calledAtWin2.ID != tk.ID {
		t.Fatalf("window 2 call redirected ticket: %+v %v", calledAtWin2, err)
	}
}

func TestPostgresPriorityScheduling(t *testing.T) {
	ctx, p, _ := integration(t)

	// Create regular WAITING ticket entered queue at T0
	waiting := create(t, ctx, p, parcels, "prio-wait")
	execSQL(t, ctx, p, `UPDATE tickets SET queue_entered_at='2026-01-01T10:00:00Z' WHERE id=$1::uuid`, waiting.ID)

	// Create APPOINTMENT whose scheduled_time has already arrived (e.g. 5 minutes ago)
	schedPast := time.Now().UTC().Add(-5 * time.Minute)
	aptPast, err := p.CreateAppointment(ctx, application.CreateAppointmentCommand{
		BranchID:       demoBranch,
		ServiceID:      parcels,
		ScheduledTime:  schedPast,
		IdempotencyKey: "prio-apt-past",
	})
	if err != nil {
		t.Fatal(err)
	}
	execSQL(t, ctx, p, `UPDATE tickets SET queue_entered_at='2026-01-01T11:00:00Z' WHERE id=$1::uuid`, aptPast.Ticket.ID)

	// Create APPOINTMENT scheduled far in the future (20 minutes ahead)
	schedFar := time.Now().UTC().Add(20 * time.Minute)
	aptFar, err := p.CreateAppointment(ctx, application.CreateAppointmentCommand{
		BranchID:       demoBranch,
		ServiceID:      parcels,
		ScheduledTime:  schedFar,
		IdempotencyKey: "prio-apt-far",
	})
	if err != nil {
		t.Fatal(err)
	}

	// Create APPOINTMENT scheduled 2 minutes in the future (within 5 minutes window)
	schedNear := time.Now().UTC().Add(2 * time.Minute)
	aptNear, err := p.CreateAppointment(ctx, application.CreateAppointmentCommand{
		BranchID:       demoBranch,
		ServiceID:      parcels,
		ScheduledTime:  schedNear,
		IdempotencyKey: "prio-apt-near",
	})
	if err != nil {
		t.Fatal(err)
	}

	// Call 1: aptPast MUST be called first (rank 0: scheduled_time <= now), beating waiting (rank 1)
	c1, err := p.CallNext(ctx, window1)
	if err != nil || c1.ID != aptPast.Ticket.ID {
		t.Fatalf("first call: expected past appointment %s, got %+v (err=%v)", aptPast.Ticket.ID, c1, err)
	}
	_, err = p.StartService(ctx, c1.ID)
	if err != nil {
		t.Fatal(err)
	}
	_, err = p.CompleteService(ctx, c1.ID)
	if err != nil {
		t.Fatal(err)
	}

	// Call 2: waiting ticket MUST be called second (rank 1: WAITING), beating aptNear (rank 2: SCHEDULED within 5m)
	c2, err := p.CallNext(ctx, window1)
	if err != nil || c2.ID != waiting.ID {
		t.Fatalf("second call: expected waiting ticket %s, got %+v (err=%v)", waiting.ID, c2, err)
	}
	_, err = p.StartService(ctx, c2.ID)
	if err != nil {
		t.Fatal(err)
	}
	_, err = p.CompleteService(ctx, c2.ID)
	if err != nil {
		t.Fatal(err)
	}

	// Call 3: aptNear MUST be called third (rank 2: SCHEDULED within 5m)
	c3, err := p.CallNext(ctx, window1)
	if err != nil || c3.ID != aptNear.Ticket.ID {
		t.Fatalf("third call: expected near appointment %s, got %+v (err=%v)", aptNear.Ticket.ID, c3, err)
	}
	_, err = p.StartService(ctx, c3.ID)
	if err != nil {
		t.Fatal(err)
	}
	_, err = p.CompleteService(ctx, c3.ID)
	if err != nil {
		t.Fatal(err)
	}

	// Call 4: aptFar is NOT eligible (> 5 min in future), so ErrNoEligibleTickets
	_, err = p.CallNext(ctx, window1)
	wantError(t, err, application.ErrNoEligibleTickets)

	_ = aptFar
}
