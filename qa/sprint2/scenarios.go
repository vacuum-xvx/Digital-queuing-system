package sprint2qa

import (
	"context"
	"fmt"
	"net/http"
	"sync"
	"time"
)

type Logger interface {
	Logf(format string, args ...any)
}

type stdLogger struct{}

func (s stdLogger) Logf(format string, args ...any) {
	fmt.Printf(format+"\n", args...)
}

var DefaultLogger Logger = stdLogger{}

// VerifyFoundation checks /health and /ready endpoints.
func VerifyFoundation(ctx context.Context, client *Client) error {
	healthStatus, hBody, err := client.GetHealth(ctx)
	if err != nil {
		return fmt.Errorf("foundation check: GET /health failed: %w", err)
	}
	if healthStatus != http.StatusOK {
		return fmt.Errorf("foundation check: GET /health returned status %d (body: %v)", healthStatus, hBody)
	}

	readyStatus, rBody, err := client.GetReady(ctx)
	if err != nil {
		return fmt.Errorf("foundation check: GET /ready failed: %w", err)
	}
	if readyStatus != http.StatusOK {
		return fmt.Errorf("foundation check: GET /ready returned status %d (body: %v)", readyStatus, rBody)
	}

	return nil
}

// SCENARIO A — APPOINTMENT CREATE + IDEMPOTENCY
func RunScenarioA(ctx context.Context, client *Client, log Logger) error {
	log.Logf("Running Scenario A: Appointment Create + Idempotency")
	if err := PreflightCleanEnvironment(ctx, client); err != nil {
		return fmt.Errorf("scenario A preflight: %w", err)
	}

	key := fmt.Sprintf("scen-a-%d", time.Now().UnixNano())
	scheduledAt := time.Now().UTC().Add(10 * time.Minute).Truncate(time.Second)
	scheduledAtStr := scheduledAt.Format(time.RFC3339)

	// 1. Create future PARCELS Appointment
	resp, errResp, status, err := client.CreateAppointment(ctx, DemoBranchID, ParcelsServiceID, scheduledAtStr, key)
	if err != nil {
		return fmt.Errorf("create appointment failed: %w", err)
	}
	if status != http.StatusCreated || resp == nil {
		return fmt.Errorf("expected 201 Created, got status %d (err: %v)", status, errResp)
	}
	defer CancelIfScheduled(ctx, client, resp.Ticket.ID)

	if resp.Ticket.Source != "APPOINTMENT" {
		return fmt.Errorf("expected source APPOINTMENT, got %q", resp.Ticket.Source)
	}
	if resp.Ticket.Status != "SCHEDULED" {
		return fmt.Errorf("expected status SCHEDULED, got %q", resp.Ticket.Status)
	}
	if resp.Ticket.Window != nil {
		return fmt.Errorf("expected window null, got %v", resp.Ticket.Window)
	}
	ticketID := resp.Ticket.ID
	publicNumber := resp.Ticket.PublicNumber

	// Verify scheduledAt in response represents same instant
	respTime, pErr := time.Parse(time.RFC3339, resp.ScheduledAt)
	if pErr != nil {
		return fmt.Errorf("could not parse scheduledAt in response %q: %w", resp.ScheduledAt, pErr)
	}
	if !respTime.Equal(scheduledAt) {
		return fmt.Errorf("response scheduledAt %v does not match requested %v", respTime, scheduledAt)
	}

	// 2. Replay same key with identical input -> 200 OK, same Ticket
	repResp, repErrResp, repStatus, repErr := client.CreateAppointment(ctx, DemoBranchID, ParcelsServiceID, scheduledAtStr, key)
	if repErr != nil {
		return fmt.Errorf("replay appointment failed: %w", repErr)
	}
	if repStatus != http.StatusOK || repResp == nil {
		return fmt.Errorf("expected replay 200 OK, got %d (err: %v)", repStatus, repErrResp)
	}
	if repResp.Ticket.ID != ticketID || repResp.Ticket.PublicNumber != publicNumber {
		return fmt.Errorf("replayed ticket mismatch: expected id %s, public %s, got id %s, public %s",
			ticketID, publicNumber, repResp.Ticket.ID, repResp.Ticket.PublicNumber)
	}

	// 3. Conflicting same key with different scheduledAt -> 409 IDEMPOTENCY_CONFLICT
	diffTime := scheduledAt.Add(5 * time.Minute).Format(time.RFC3339)
	_, cErrResp, cStatus, cErr := client.CreateAppointment(ctx, DemoBranchID, ParcelsServiceID, diffTime, key)
	if cErr != nil {
		return fmt.Errorf("conflicting appointment request failed: %w", cErr)
	}
	if cStatus != http.StatusConflict || cErrResp == nil || cErrResp.Error.Code != "IDEMPOTENCY_CONFLICT" {
		return fmt.Errorf("expected 409 IDEMPOTENCY_CONFLICT for changed time, got %d (body: %v)", cStatus, cErrResp)
	}

	// 4. Conflicting same key with different serviceId -> 409 IDEMPOTENCY_CONFLICT
	_, sErrResp, sStatus, sErr := client.CreateAppointment(ctx, DemoBranchID, PaymentsServiceID, scheduledAtStr, key)
	if sErr != nil {
		return fmt.Errorf("conflicting appointment request with diff service failed: %w", sErr)
	}
	if sStatus != http.StatusConflict || sErrResp == nil || sErrResp.Error.Code != "IDEMPOTENCY_CONFLICT" {
		return fmt.Errorf("expected 409 IDEMPOTENCY_CONFLICT for changed service, got %d (body: %v)", sStatus, sErrResp)
	}

	log.Logf("Scenario A PASSED")
	return nil
}

// SCENARIO B — FUTURE APPOINTMENT NOT ELIGIBLE
func RunScenarioB(ctx context.Context, client *Client, log Logger) error {
	log.Logf("Running Scenario B: Future Appointment Not Eligible")
	if err := PreflightCleanEnvironment(ctx, client); err != nil {
		return fmt.Errorf("scenario B preflight: %w", err)
	}

	// Create Appointment safely in near future (6s ahead)
	keyApp := fmt.Sprintf("scen-b-app-%d", time.Now().UnixNano())
	scheduledAt := time.Now().UTC().Add(6 * time.Second).Truncate(time.Second)
	appResp, aErrResp, aStatus, aErr := client.CreateAppointment(ctx, DemoBranchID, ParcelsServiceID, scheduledAt.Format(time.RFC3339), keyApp)
	if aErr != nil || aStatus != http.StatusCreated || appResp == nil {
		return fmt.Errorf("failed to create future appointment (status %d, err: %v): %w", aStatus, aErrResp, aErr)
	}
	defer CancelIfScheduled(ctx, client, appResp.Ticket.ID)

	// Create QR Ticket
	keyQR := fmt.Sprintf("scen-b-qr-%d", time.Now().UnixNano())
	qrTicket, qrErrResp, qrStatus, qrErr := client.CreateQRTicket(ctx, DemoBranchID, ParcelsServiceID, keyQR)
	if qrErr != nil || qrStatus != http.StatusCreated || qrTicket == nil {
		return fmt.Errorf("failed to create QR ticket (status %d, err: %v): %w", qrStatus, qrErrResp, qrErr)
	}

	// Call Window 1 before scheduledAt has arrived
	if !time.Now().UTC().Before(scheduledAt) {
		return fmt.Errorf("test timing overrun: scheduledAt %v already passed before call-next", scheduledAt)
	}

	calledTicket, cErrResp, cStatus, cErr := client.CallNext(ctx, Window1ID)
	if cErr != nil || cStatus != http.StatusOK || calledTicket == nil {
		return fmt.Errorf("Window 1 call-next failed (status %d, err: %v): %w", cStatus, cErrResp, cErr)
	}

	// Assert: QR ticket was selected, NOT the future appointment
	if calledTicket.ID != qrTicket.ID {
		return fmt.Errorf("expected QR ticket %s to be called, but got ticket %s (source %s)",
			qrTicket.ID, calledTicket.ID, calledTicket.Source)
	}

	// Complete QR
	if _, _, status, err := client.StartService(ctx, calledTicket.ID); err != nil || status != http.StatusOK {
		return fmt.Errorf("start QR service failed: %w", err)
	}
	if _, _, status, err := client.CompleteService(ctx, calledTicket.ID); err != nil || status != http.StatusOK {
		return fmt.Errorf("complete QR service failed: %w", err)
	}

	// Verify Appointment ticket remains SCHEDULED
	appTicket, _, tStatus, tErr := client.GetTicket(ctx, appResp.Ticket.ID)
	if tErr != nil || tStatus != http.StatusOK || appTicket == nil {
		return fmt.Errorf("get appointment ticket failed: %w", tErr)
	}
	if appTicket.Status != "SCHEDULED" {
		return fmt.Errorf("expected appointment status SCHEDULED, got %q", appTicket.Status)
	}

	log.Logf("Scenario B PASSED")
	return nil
}

// SCENARIO C — DUE APPOINTMENT PRIORITY
func RunScenarioC(ctx context.Context, client *Client, log Logger) error {
	log.Logf("Running Scenario C: Due Appointment Priority")
	if err := PreflightCleanEnvironment(ctx, client); err != nil {
		return fmt.Errorf("scenario C preflight: %w", err)
	}

	// Create near-future Appointment (2s ahead)
	keyApp := fmt.Sprintf("scen-c-app-%d", time.Now().UnixNano())
	scheduledAt := time.Now().UTC().Add(2 * time.Second).Truncate(time.Second)
	appResp, aErrResp, aStatus, aErr := client.CreateAppointment(ctx, DemoBranchID, ParcelsServiceID, scheduledAt.Format(time.RFC3339), keyApp)
	if aErr != nil || aStatus != http.StatusCreated || appResp == nil {
		return fmt.Errorf("failed to create appointment (status %d, err: %v): %w", aStatus, aErrResp, aErr)
	}
	defer CancelIfScheduled(ctx, client, appResp.Ticket.ID)

	// Create QR Ticket before due time
	keyQR := fmt.Sprintf("scen-c-qr-%d", time.Now().UnixNano())
	qrTicket, qrErrResp, qrStatus, qrErr := client.CreateQRTicket(ctx, DemoBranchID, ParcelsServiceID, keyQR)
	if qrErr != nil || qrStatus != http.StatusCreated || qrTicket == nil {
		return fmt.Errorf("failed to create QR ticket (status %d, err: %v): %w", qrStatus, qrErrResp, qrErr)
	}
	defer func() {
		// Clean up QR ticket if needed
		_ = SettleCurrent(ctx, client, Window1ID)
		_ = DrainWindow(ctx, client, Window1ID)
	}()

	// Wait until scheduledAt has passed plus safety margin
	wait := time.Until(scheduledAt) + 400*time.Millisecond
	if wait > 0 {
		time.Sleep(wait)
	}

	// Call Window 1
	calledTicket, cErrResp, cStatus, cErr := client.CallNext(ctx, Window1ID)
	if cErr != nil || cStatus != http.StatusOK || calledTicket == nil {
		return fmt.Errorf("call-next failed (status %d, err: %v): %w", cStatus, cErrResp, cErr)
	}

	// Assert: Appointment wins despite QR waiting
	if calledTicket.ID != appResp.Ticket.ID {
		return fmt.Errorf("priority failure: expected appointment ticket %s to win, but got %s (source %s)",
			appResp.Ticket.ID, calledTicket.ID, calledTicket.Source)
	}
	if calledTicket.Source != "APPOINTMENT" || calledTicket.Status != "CALLED" {
		return fmt.Errorf("expected source APPOINTMENT and status CALLED, got %s / %s",
			calledTicket.Source, calledTicket.Status)
	}

	// Start and complete Appointment
	if _, _, status, err := client.StartService(ctx, calledTicket.ID); err != nil || status != http.StatusOK {
		return fmt.Errorf("start appointment failed: %w", err)
	}
	if _, _, status, err := client.CompleteService(ctx, calledTicket.ID); err != nil || status != http.StatusOK {
		return fmt.Errorf("complete appointment failed: %w", err)
	}

	// Drain remaining QR ticket
	qrCalled, qErrResp, qStatus, qErr := client.CallNext(ctx, Window1ID)
	if qErr != nil || qStatus != http.StatusOK || qrCalled == nil {
		return fmt.Errorf("call-next for remaining QR failed (status %d, err: %v): %w", qStatus, qErrResp, qErr)
	}
	if qrCalled.ID != qrTicket.ID {
		return fmt.Errorf("expected remaining QR ticket %s, got %s", qrTicket.ID, qrCalled.ID)
	}
	if _, _, status, err := client.StartService(ctx, qrCalled.ID); err != nil || status != http.StatusOK {
		return fmt.Errorf("start QR failed: %w", err)
	}
	if _, _, status, err := client.CompleteService(ctx, qrCalled.ID); err != nil || status != http.StatusOK {
		return fmt.Errorf("complete QR failed: %w", err)
	}

	// Verify no active state remains in window 1
	cur, _, curStatus, _ := client.GetCurrentTicket(ctx, Window1ID)
	if curStatus != http.StatusNoContent && (curStatus == http.StatusOK && cur != nil) {
		return fmt.Errorf("active ticket still present in Window 1: %v", cur)
	}

	log.Logf("Scenario C PASSED")
	return nil
}

// SCENARIO D — SERVICE ROUTING
func RunScenarioD(ctx context.Context, client *Client, log Logger) error {
	log.Logf("Running Scenario D: Service Routing")
	if err := PreflightCleanEnvironment(ctx, client); err != nil {
		return fmt.Errorf("scenario D preflight: %w", err)
	}

	// Create due PARCELS Appointment
	key := fmt.Sprintf("scen-d-app-%d", time.Now().UnixNano())
	scheduledAt := time.Now().UTC().Add(1 * time.Second).Truncate(time.Second)
	appResp, aErrResp, aStatus, aErr := client.CreateAppointment(ctx, DemoBranchID, ParcelsServiceID, scheduledAt.Format(time.RFC3339), key)
	if aErr != nil || aStatus != http.StatusCreated || appResp == nil {
		return fmt.Errorf("failed to create appointment (status %d, err: %v): %w", aStatus, aErrResp, aErr)
	}
	defer CancelIfScheduled(ctx, client, appResp.Ticket.ID)

	// Wait until due
	wait := time.Until(scheduledAt) + 300*time.Millisecond
	if wait > 0 {
		time.Sleep(wait)
	}

	// Window 2 (PAYMENTS only) call-next -> 409 NO_ELIGIBLE_TICKETS
	_, pErrResp, pStatus, pErr := client.CallNext(ctx, Window2ID)
	if pErr != nil {
		return fmt.Errorf("Window 2 call-next failed: %w", pErr)
	}
	if pStatus != http.StatusConflict || pErrResp == nil || pErrResp.Error.Code != "NO_ELIGIBLE_TICKETS" {
		return fmt.Errorf("expected Window 2 to get 409 NO_ELIGIBLE_TICKETS, got status %d (err: %v)", pStatus, pErrResp)
	}

	// Window 1 (PARCELS) call-next -> 200 OK, gets PARCELS Appointment
	calledTicket, cErrResp, cStatus, cErr := client.CallNext(ctx, Window1ID)
	if cErr != nil || cStatus != http.StatusOK || calledTicket == nil {
		return fmt.Errorf("Window 1 call-next failed (status %d, err: %v): %w", cStatus, cErrResp, cErr)
	}
	if calledTicket.ID != appResp.Ticket.ID {
		return fmt.Errorf("expected Window 1 to get ticket %s, got %s", appResp.Ticket.ID, calledTicket.ID)
	}

	// Complete it
	if _, _, status, err := client.StartService(ctx, calledTicket.ID); err != nil || status != http.StatusOK {
		return fmt.Errorf("start service failed: %w", err)
	}
	if _, _, status, err := client.CompleteService(ctx, calledTicket.ID); err != nil || status != http.StatusOK {
		return fmt.Errorf("complete service failed: %w", err)
	}

	log.Logf("Scenario D PASSED")
	return nil
}

// SCENARIO E — CANCEL
func RunScenarioE(ctx context.Context, client *Client, log Logger) error {
	log.Logf("Running Scenario E: Cancel")
	if err := PreflightCleanEnvironment(ctx, client); err != nil {
		return fmt.Errorf("scenario E preflight: %w", err)
	}

	key := fmt.Sprintf("scen-e-app-%d", time.Now().UnixNano())
	scheduledAt := time.Now().UTC().Add(10 * time.Minute).Truncate(time.Second)
	appResp, aErrResp, aStatus, aErr := client.CreateAppointment(ctx, DemoBranchID, ParcelsServiceID, scheduledAt.Format(time.RFC3339), key)
	if aErr != nil || aStatus != http.StatusCreated || appResp == nil {
		return fmt.Errorf("failed to create appointment (status %d, err: %v): %w", aStatus, aErrResp, aErr)
	}

	// 1. Cancel Appointment -> 200 OK, status CANCELLED
	cResp, cErrResp, cStatus, cErr := client.CancelAppointment(ctx, appResp.Ticket.ID)
	if cErr != nil {
		return fmt.Errorf("cancel appointment failed: %w", cErr)
	}
	if cStatus != http.StatusOK || cResp == nil {
		return fmt.Errorf("expected 200 OK on cancel, got %d (err: %v)", cStatus, cErrResp)
	}
	if cResp.Ticket.Status != "CANCELLED" {
		return fmt.Errorf("expected status CANCELLED, got %q", cResp.Ticket.Status)
	}

	// 2. Repeat cancel -> 200 OK, still CANCELLED
	rResp, rErrResp, rStatus, rErr := client.CancelAppointment(ctx, appResp.Ticket.ID)
	if rErr != nil {
		return fmt.Errorf("repeat cancel failed: %w", rErr)
	}
	if rStatus != http.StatusOK || rResp == nil {
		return fmt.Errorf("expected 200 OK on repeat cancel, got %d (err: %v)", rStatus, rErrResp)
	}
	if rResp.Ticket.Status != "CANCELLED" {
		return fmt.Errorf("expected status CANCELLED on repeat cancel, got %q", rResp.Ticket.Status)
	}

	// 3. Prove CANCELLED Appointment is never selected
	_, callErrResp, callStatus, callErr := client.CallNext(ctx, Window1ID)
	if callErr != nil {
		return fmt.Errorf("call-next check failed: %w", callErr)
	}
	if callStatus != http.StatusConflict || callErrResp == nil || callErrResp.Error.Code != "NO_ELIGIBLE_TICKETS" {
		return fmt.Errorf("expected 409 NO_ELIGIBLE_TICKETS, got %d (err: %v)", callStatus, callErrResp)
	}

	// Verify ticket status remains CANCELLED
	t, _, tStatus, _ := client.GetTicket(ctx, appResp.Ticket.ID)
	if tStatus != http.StatusOK || t.Status != "CANCELLED" {
		return fmt.Errorf("expected ticket status CANCELLED, got %s (http status %d)", t.Status, tStatus)
	}

	log.Logf("Scenario E PASSED")
	return nil
}

// SCENARIO F — CANCEL VS CALL CONCURRENCY
func RunScenarioF(ctx context.Context, client *Client, log Logger) error {
	log.Logf("Running Scenario F: Cancel vs Call Concurrency")
	if err := PreflightCleanEnvironment(ctx, client); err != nil {
		return fmt.Errorf("scenario F preflight: %w", err)
	}

	// Create due Appointment
	key := fmt.Sprintf("scen-f-app-%d", time.Now().UnixNano())
	scheduledAt := time.Now().UTC().Add(1 * time.Second).Truncate(time.Second)
	appResp, aErrResp, aStatus, aErr := client.CreateAppointment(ctx, DemoBranchID, ParcelsServiceID, scheduledAt.Format(time.RFC3339), key)
	if aErr != nil || aStatus != http.StatusCreated || appResp == nil {
		return fmt.Errorf("failed to create appointment (status %d, err: %v): %w", aStatus, aErrResp, aErr)
	}
	defer CancelIfScheduled(ctx, client, appResp.Ticket.ID)

	wait := time.Until(scheduledAt) + 300*time.Millisecond
	if wait > 0 {
		time.Sleep(wait)
	}

	// Run concurrent cancel and call-next
	var wg sync.WaitGroup
	wg.Add(2)
	barrier := make(chan struct{})

	var cancelStatus int
	var cancelErrResp *ErrorResponse
	var cancelResp *AppointmentResponseDTO

	var callStatus int
	var callErrResp *ErrorResponse
	var callTicket *TicketDTO

	go func() {
		defer wg.Done()
		<-barrier
		cancelResp, cancelErrResp, cancelStatus, _ = client.CancelAppointment(ctx, appResp.Ticket.ID)
	}()

	go func() {
		defer wg.Done()
		<-barrier
		callTicket, callErrResp, callStatus, _ = client.CallNext(ctx, Window1ID)
	}()

	close(barrier)
	wg.Wait()
	_ = cancelResp
	_ = callTicket

	log.Logf("Concurrency results: Cancel status %d, Call status %d", cancelStatus, callStatus)

	outcome1 := (cancelStatus == http.StatusOK && callStatus == http.StatusConflict && callErrResp != nil && callErrResp.Error.Code == "NO_ELIGIBLE_TICKETS")
	outcome2 := (callStatus == http.StatusOK && cancelStatus == http.StatusConflict && cancelErrResp != nil && cancelErrResp.Error.Code == "INVALID_TICKET_STATE")

	if !outcome1 && !outcome2 {
		return fmt.Errorf("invalid concurrency race result: cancelStatus=%d (err: %v), callStatus=%d (err: %v)",
			cancelStatus, cancelErrResp, callStatus, callErrResp)
	}

	// Inspect final ticket state
	finalTicket, _, ftStatus, ftErr := client.GetTicket(ctx, appResp.Ticket.ID)
	if ftErr != nil || ftStatus != http.StatusOK {
		return fmt.Errorf("failed to get ticket after race: %w", ftErr)
	}

	if outcome1 {
		log.Logf("Outcome 1 won: cancel succeeded, call received NO_ELIGIBLE_TICKETS")
		if finalTicket.Status != "CANCELLED" || finalTicket.Window != nil {
			return fmt.Errorf("outcome 1 failed: expected CANCELLED with no window, got status %s, window %v",
				finalTicket.Status, finalTicket.Window)
		}
	} else {
		log.Logf("Outcome 2 won: call succeeded, cancel received INVALID_TICKET_STATE")
		if finalTicket.Status != "CALLED" || finalTicket.Window == nil {
			return fmt.Errorf("outcome 2 failed: expected CALLED with window, got status %s, window %v",
				finalTicket.Status, finalTicket.Window)
		}
		// Cleanup active ticket
		_, _, _, _ = client.StartService(ctx, finalTicket.ID)
		_, _, _, _ = client.CompleteService(ctx, finalTicket.ID)
	}

	// Settle window 1
	_ = SettleCurrent(ctx, client, Window1ID)

	log.Logf("Scenario F PASSED")
	return nil
}

// SCENARIO G — APPOINTMENT DOUBLE CLAIM
func RunScenarioG(ctx context.Context, client *Client, log Logger) error {
	log.Logf("Running Scenario G: Appointment Double Claim")
	if err := PreflightCleanEnvironment(ctx, client); err != nil {
		return fmt.Errorf("scenario G preflight: %w", err)
	}

	// Create single due Appointment
	key := fmt.Sprintf("scen-g-app-%d", time.Now().UnixNano())
	scheduledAt := time.Now().UTC().Add(1 * time.Second).Truncate(time.Second)
	appResp, aErrResp, aStatus, aErr := client.CreateAppointment(ctx, DemoBranchID, ParcelsServiceID, scheduledAt.Format(time.RFC3339), key)
	if aErr != nil || aStatus != http.StatusCreated || appResp == nil {
		return fmt.Errorf("failed to create appointment (status %d, err: %v): %w", aStatus, aErrResp, aErr)
	}
	defer CancelIfScheduled(ctx, client, appResp.Ticket.ID)

	wait := time.Until(scheduledAt) + 300*time.Millisecond
	if wait > 0 {
		time.Sleep(wait)
	}

	// Concurrent call-next: Window 1 vs Window 3 (both serve PARCELS)
	var wg sync.WaitGroup
	wg.Add(2)
	barrier := make(chan struct{})

	var w1Ticket *TicketDTO
	var w1ErrResp *ErrorResponse
	var w1Status int

	var w3Ticket *TicketDTO
	var w3ErrResp *ErrorResponse
	var w3Status int

	go func() {
		defer wg.Done()
		<-barrier
		w1Ticket, w1ErrResp, w1Status, _ = client.CallNext(ctx, Window1ID)
	}()

	go func() {
		defer wg.Done()
		<-barrier
		w3Ticket, w3ErrResp, w3Status, _ = client.CallNext(ctx, Window3ID)
	}()

	close(barrier)
	wg.Wait()

	log.Logf("Double claim results: Window 1 status %d, Window 3 status %d", w1Status, w3Status)

	w1Won := w1Status == http.StatusOK && w3Status == http.StatusConflict && w3ErrResp != nil && w3ErrResp.Error.Code == "NO_ELIGIBLE_TICKETS"
	w3Won := w3Status == http.StatusOK && w1Status == http.StatusConflict && w1ErrResp != nil && w1ErrResp.Error.Code == "NO_ELIGIBLE_TICKETS"

	if !w1Won && !w3Won {
		return fmt.Errorf("double claim violation: expected exactly one 200 and one 409 NO_ELIGIBLE_TICKETS, got w1=%d (err: %v), w3=%d (err: %v)",
			w1Status, w1ErrResp, w3Status, w3ErrResp)
	}

	winnerTicket := w1Ticket
	if w3Won {
		winnerTicket = w3Ticket
	}

	if winnerTicket.ID != appResp.Ticket.ID {
		return fmt.Errorf("winner ticket ID %s does not match appointment %s", winnerTicket.ID, appResp.Ticket.ID)
	}

	// Complete the winner
	if _, _, status, err := client.StartService(ctx, winnerTicket.ID); err != nil || status != http.StatusOK {
		return fmt.Errorf("start winning ticket failed: %w", err)
	}
	if _, _, status, err := client.CompleteService(ctx, winnerTicket.ID); err != nil || status != http.StatusOK {
		return fmt.Errorf("complete winning ticket failed: %w", err)
	}

	// Verify both windows now have no current ticket
	_ = SettleCurrent(ctx, client, Window1ID)
	_ = SettleCurrent(ctx, client, Window3ID)

	cur1, _, s1, _ := client.GetCurrentTicket(ctx, Window1ID)
	if s1 == http.StatusOK && cur1 != nil {
		return fmt.Errorf("Window 1 still has active ticket: %v", cur1)
	}
	cur3, _, s3, _ := client.GetCurrentTicket(ctx, Window3ID)
	if s3 == http.StatusOK && cur3 != nil {
		return fmt.Errorf("Window 3 still has active ticket: %v", cur3)
	}

	log.Logf("Scenario G PASSED")
	return nil
}

// SCENARIO H — POLICY VERSIONING
func RunScenarioH(ctx context.Context, client *Client, log Logger) error {
	log.Logf("Running Scenario H: Policy Versioning")
	if err := PreflightCleanEnvironment(ctx, client); err != nil {
		return fmt.Errorf("scenario H preflight: %w", err)
	}

	// 1. GET policy and remember original
	origPolicy, errResp, status, err := client.GetQueuePolicy(ctx, DemoBranchID)
	if err != nil || status != http.StatusOK || origPolicy == nil {
		return fmt.Errorf("failed to get queue policy (status %d, err: %v): %w", status, errResp, err)
	}
	origVersion := origPolicy.Version
	origApp := origPolicy.AppointmentDuePriority
	origQR := origPolicy.QRPriority

	// Cleanup must restore original policy even if intermediate assertions fail
	defer func() {
		cur, _, _, _ := client.GetQueuePolicy(context.Background(), DemoBranchID)
		if cur != nil && (cur.AppointmentDuePriority != origApp || cur.QRPriority != origQR) {
			_, _, _, _ = client.UpdateQueuePolicy(context.Background(), DemoBranchID, UpdateQueuePolicyRequest{
				AppointmentDuePriority: origApp,
				QRPriority:             origQR,
				ExpectedVersion:        cur.Version,
			})
		}
	}()

	// 2. PUT valid modified policy using current expectedVersion
	updResp, uErrResp, uStatus, uErr := client.UpdateQueuePolicy(ctx, DemoBranchID, UpdateQueuePolicyRequest{
		AppointmentDuePriority: 250,
		QRPriority:             25,
		ExpectedVersion:        origVersion,
	})
	if uErr != nil || uStatus != http.StatusOK || updResp == nil {
		return fmt.Errorf("update queue policy failed (status %d, err: %v): %w", uStatus, uErrResp, uErr)
	}

	if updResp.Version != origVersion+1 {
		return fmt.Errorf("expected incremented version %d, got %d", origVersion+1, updResp.Version)
	}
	if updResp.AppointmentDuePriority != 250 || updResp.QRPriority != 25 {
		return fmt.Errorf("policy values mismatch: got app=%d, qr=%d", updResp.AppointmentDuePriority, updResp.QRPriority)
	}

	// 3. Send another PUT using stale original version -> 409 POLICY_VERSION_CONFLICT
	_, sErrResp, sStatus, sErr := client.UpdateQueuePolicy(ctx, DemoBranchID, UpdateQueuePolicyRequest{
		AppointmentDuePriority: 300,
		QRPriority:             30,
		ExpectedVersion:        origVersion, // stale version!
	})
	if sErr != nil {
		return fmt.Errorf("stale policy update network error: %w", sErr)
	}
	if sStatus != http.StatusConflict || sErrResp == nil || sErrResp.Error.Code != "POLICY_VERSION_CONFLICT" {
		return fmt.Errorf("expected 409 POLICY_VERSION_CONFLICT for stale version, got status %d (body: %v)", sStatus, sErrResp)
	}

	// 4. Restore original numeric priorities using latest current version
	curPolicy, _, curStatus, _ := client.GetQueuePolicy(ctx, DemoBranchID)
	if curStatus != http.StatusOK || curPolicy == nil {
		return fmt.Errorf("failed to get latest policy before restore")
	}

	restResp, rErrResp, rStatus, rErr := client.UpdateQueuePolicy(ctx, DemoBranchID, UpdateQueuePolicyRequest{
		AppointmentDuePriority: origApp,
		QRPriority:             origQR,
		ExpectedVersion:        curPolicy.Version,
	})
	if rErr != nil || rStatus != http.StatusOK || restResp == nil {
		return fmt.Errorf("failed to restore queue policy (status %d, err: %v): %w", rStatus, rErrResp, rErr)
	}
	if restResp.AppointmentDuePriority != origApp || restResp.QRPriority != origQR {
		return fmt.Errorf("restored policy mismatch: expected app=%d, qr=%d, got app=%d, qr=%d",
			origApp, origQR, restResp.AppointmentDuePriority, restResp.QRPriority)
	}

	log.Logf("Scenario H PASSED")
	return nil
}

// SCENARIO I — EVENT LOG
func RunScenarioI(ctx context.Context, client *Client, log Logger) error {
	log.Logf("Running Scenario I: Event Log")
	if err := PreflightCleanEnvironment(ctx, client); err != nil {
		return fmt.Errorf("scenario I preflight: %w", err)
	}

	// 1. Fresh Appointment happy path: create -> wait due -> call -> start -> complete
	keyApp := fmt.Sprintf("scen-i-app-%d", time.Now().UnixNano())
	scheduledAt := time.Now().UTC().Add(1 * time.Second).Truncate(time.Second)
	appResp, aErrResp, aStatus, aErr := client.CreateAppointment(ctx, DemoBranchID, ParcelsServiceID, scheduledAt.Format(time.RFC3339), keyApp)
	if aErr != nil || aStatus != http.StatusCreated || appResp == nil {
		return fmt.Errorf("failed to create appointment (status %d, err: %v): %w", aStatus, aErrResp, aErr)
	}
	defer CancelIfScheduled(ctx, client, appResp.Ticket.ID)

	wait := time.Until(scheduledAt) + 300*time.Millisecond
	if wait > 0 {
		time.Sleep(wait)
	}

	called, _, cStatus, cErr := client.CallNext(ctx, Window1ID)
	if cErr != nil || cStatus != http.StatusOK || called == nil {
		return fmt.Errorf("call-next failed: %w", cErr)
	}
	if _, _, status, err := client.StartService(ctx, called.ID); err != nil || status != http.StatusOK {
		return fmt.Errorf("start service failed: %w", err)
	}
	if _, _, status, err := client.CompleteService(ctx, called.ID); err != nil || status != http.StatusOK {
		return fmt.Errorf("complete service failed: %w", err)
	}

	// GET events for appointment
	eventsResp, eErrResp, eStatus, eErr := client.ListTicketEvents(ctx, appResp.Ticket.ID)
	if eErr != nil || eStatus != http.StatusOK || eventsResp == nil {
		return fmt.Errorf("list events failed (status %d, err: %v): %w", eStatus, eErrResp, eErr)
	}

	// Verify events sequence: CREATED -> CALLED -> SERVICE_STARTED -> COMPLETED
	expectedTypes := []string{"CREATED", "CALLED", "SERVICE_STARTED", "COMPLETED"}
	if len(eventsResp.Items) != 4 {
		return fmt.Errorf("expected 4 events for appointment, got %d: %v", len(eventsResp.Items), eventsResp.Items)
	}
	for idx, exp := range expectedTypes {
		if eventsResp.Items[idx].Type != exp {
			return fmt.Errorf("event [%d] expected %s, got %s", idx, exp, eventsResp.Items[idx].Type)
		}
	}

	// CALLED event must contain policyVersion and decisionPriority
	calledEvent := eventsResp.Items[1]
	if calledEvent.PolicyVersion == nil || *calledEvent.PolicyVersion <= 0 {
		return fmt.Errorf("CALLED event missing valid policyVersion: %v", calledEvent.PolicyVersion)
	}
	if calledEvent.DecisionPriority == nil || *calledEvent.DecisionPriority <= 0 {
		return fmt.Errorf("CALLED event missing valid decisionPriority: %v", calledEvent.DecisionPriority)
	}
	if calledEvent.WindowID == nil || *calledEvent.WindowID != Window1ID {
		return fmt.Errorf("CALLED event windowID expected %s, got %v", Window1ID, calledEvent.WindowID)
	}

	// 2. Cancel path: create future -> cancel
	keyCancel := fmt.Sprintf("scen-i-cancel-%d", time.Now().UnixNano())
	futureAt := time.Now().UTC().Add(10 * time.Minute).Truncate(time.Second)
	cancelApp, _, caStatus, caErr := client.CreateAppointment(ctx, DemoBranchID, ParcelsServiceID, futureAt.Format(time.RFC3339), keyCancel)
	if caErr != nil || caStatus != http.StatusCreated || cancelApp == nil {
		return fmt.Errorf("create cancel appointment failed: %w", caErr)
	}

	if _, _, status, err := client.CancelAppointment(ctx, cancelApp.Ticket.ID); err != nil || status != http.StatusOK {
		return fmt.Errorf("cancel appointment failed: %w", err)
	}

	cEvents, _, ceStatus, ceErr := client.ListTicketEvents(ctx, cancelApp.Ticket.ID)
	if ceErr != nil || ceStatus != http.StatusOK || cEvents == nil {
		return fmt.Errorf("list cancel events failed: %w", ceErr)
	}
	if len(cEvents.Items) != 2 {
		return fmt.Errorf("expected 2 cancel events (CREATED, CANCELLED), got %d", len(cEvents.Items))
	}
	if cEvents.Items[0].Type != "CREATED" || cEvents.Items[1].Type != "CANCELLED" {
		return fmt.Errorf("unexpected cancel events: %v", cEvents.Items)
	}
	if cEvents.Items[1].FromStatus == nil || *cEvents.Items[1].FromStatus != "SCHEDULED" || cEvents.Items[1].ToStatus != "CANCELLED" {
		return fmt.Errorf("unexpected cancel event statuses: from=%v, to=%s", cEvents.Items[1].FromStatus, cEvents.Items[1].ToStatus)
	}

	// 3. QR transitions generate events without breaking Sprint #1 flow
	keyQR := fmt.Sprintf("scen-i-qr-%d", time.Now().UnixNano())
	qrTicket, _, qrStatus, qrErr := client.CreateQRTicket(ctx, DemoBranchID, ParcelsServiceID, keyQR)
	if qrErr != nil || qrStatus != http.StatusCreated || qrTicket == nil {
		return fmt.Errorf("create QR ticket failed: %w", qrErr)
	}
	qrCalled, _, qrcStatus, _ := client.CallNext(ctx, Window1ID)
	if qrcStatus != http.StatusOK || qrCalled == nil {
		return fmt.Errorf("call QR ticket failed")
	}
	_, _, _, _ = client.StartService(ctx, qrCalled.ID)
	_, _, _, _ = client.CompleteService(ctx, qrCalled.ID)

	qrEvents, _, qreStatus, qreErr := client.ListTicketEvents(ctx, qrTicket.ID)
	if qreErr != nil || qreStatus != http.StatusOK || qrEvents == nil {
		return fmt.Errorf("list QR events failed: %w", qreErr)
	}
	if len(qrEvents.Items) != 4 {
		return fmt.Errorf("expected 4 QR events, got %d", len(qrEvents.Items))
	}
	for idx, exp := range expectedTypes {
		if qrEvents.Items[idx].Type != exp {
			return fmt.Errorf("QR event [%d] expected %s, got %s", idx, exp, qrEvents.Items[idx].Type)
		}
	}

	log.Logf("Scenario I PASSED")
	return nil
}
