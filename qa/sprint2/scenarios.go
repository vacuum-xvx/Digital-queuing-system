package sprint2qa

import (
	"context"
	"fmt"
	"net/http"
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

// RunScenarioE executes Scenario E — Appointment booking and cancellation.
func RunScenarioE(ctx context.Context, client *Client, log Logger) error {
	if log == nil {
		log = DefaultLogger
	}
	log.Logf("Running Scenario E: Appointment Booking and Cancellation")

	// 1. Preflight clean environment
	if err := PreflightCleanEnvironment(ctx, client); err != nil {
		return fmt.Errorf("scenario E preflight failed: %w", err)
	}

	// 2. Create an Appointment ticket
	schedTime := time.Now().UTC().Add(30 * time.Minute).Truncate(time.Second).Format(time.RFC3339)
	idemKey := fmt.Sprintf("qa-sprint2-scenE-%d", time.Now().UnixNano())
	ticket, errResp, status, err := client.CreateAppointment(ctx, DemoBranchID, ParcelsServiceID, schedTime, idemKey)
	if err != nil || status != http.StatusCreated || ticket == nil {
		return fmt.Errorf("scenario E: CreateAppointment failed (status=%d, errResp=%v): %w", status, errResp, err)
	}

	if ticket.Source != "APPOINTMENT" {
		return fmt.Errorf("scenario E: expected source 'APPOINTMENT', got %q", ticket.Source)
	}
	if ticket.Status != "SCHEDULED" {
		return fmt.Errorf("scenario E: expected status 'SCHEDULED', got %q", ticket.Status)
	}
	if ticket.BranchID != DemoBranchID {
		return fmt.Errorf("scenario E: expected branchId %s, got %s", DemoBranchID, ticket.BranchID)
	}
	if ticket.ServiceID != ParcelsServiceID {
		return fmt.Errorf("scenario E: expected serviceId %s, got %s", ParcelsServiceID, ticket.ServiceID)
	}
	if ticket.ScheduledTime == nil || *ticket.ScheduledTime == "" {
		return fmt.Errorf("scenario E: expected non-empty scheduledTime in response")
	}

	// 3. Idempotent replay
	replayed, errResp, status, err := client.CreateAppointment(ctx, DemoBranchID, ParcelsServiceID, schedTime, idemKey)
	if err != nil || status != http.StatusOK || replayed == nil {
		return fmt.Errorf("scenario E: Idempotent replay failed (status=%d, errResp=%v): %w", status, errResp, err)
	}
	if replayed.ID != ticket.ID {
		return fmt.Errorf("scenario E: replay returned different ticket ID (%s vs %s)", replayed.ID, ticket.ID)
	}

	// 4. Idempotency conflict check (same key, different serviceId)
	_, conflictErrResp, status, err := client.CreateAppointment(ctx, DemoBranchID, PaymentsServiceID, schedTime, idemKey)
	if err != nil || status != http.StatusConflict || conflictErrResp == nil {
		return fmt.Errorf("scenario E: expected 409 on conflict key, got status=%d, err=%v", status, err)
	}
	if conflictErrResp.Error.Code != "IDEMPOTENCY_CONFLICT" {
		return fmt.Errorf("scenario E: expected IDEMPOTENCY_CONFLICT, got %s", conflictErrResp.Error.Code)
	}

	// 5. Verify ticket status via GET /tickets/{id}
	getTicket, _, status, err := client.GetTicket(ctx, ticket.ID)
	if err != nil || status != http.StatusOK || getTicket == nil {
		return fmt.Errorf("scenario E: GET ticket failed (status=%d): %w", status, err)
	}
	if getTicket.Status != "SCHEDULED" {
		return fmt.Errorf("scenario E: expected GET ticket status SCHEDULED, got %s", getTicket.Status)
	}

	// 6. Cancel ticket
	cancelled, errResp, status, err := client.CancelTicket(ctx, ticket.ID)
	if err != nil || status != http.StatusOK || cancelled == nil {
		return fmt.Errorf("scenario E: CancelTicket failed (status=%d, errResp=%v): %w", status, errResp, err)
	}
	if cancelled.Status != "CANCELLED" {
		return fmt.Errorf("scenario E: expected status CANCELLED, got %s", cancelled.Status)
	}

	// 7. Verify cancellation persisted
	getCancelled, _, status, err := client.GetTicket(ctx, ticket.ID)
	if err != nil || status != http.StatusOK || getCancelled == nil {
		return fmt.Errorf("scenario E: GET cancelled ticket failed: %w", err)
	}
	if getCancelled.Status != "CANCELLED" {
		return fmt.Errorf("scenario E: expected persisted status CANCELLED, got %s", getCancelled.Status)
	}

	// 8. Cannot cancel already cancelled ticket
	_, secondCancelErr, status, err := client.CancelTicket(ctx, ticket.ID)
	if err != nil || status != http.StatusConflict || secondCancelErr == nil {
		return fmt.Errorf("scenario E: expected 409 on second cancel, got status=%d, err=%v", status, err)
	}
	if secondCancelErr.Error.Code != "INVALID_TICKET_STATE" {
		return fmt.Errorf("scenario E: expected INVALID_TICKET_STATE, got %s", secondCancelErr.Error.Code)
	}

	// 9. Window 1 cannot call the cancelled ticket
	_, callErr, status, err := client.CallNext(ctx, Window1ID)
	if err != nil || status != http.StatusConflict || callErr == nil {
		return fmt.Errorf("scenario E: expected 409 NO_ELIGIBLE_TICKETS on CallNext, got status=%d, err=%v", status, err)
	}
	if callErr.Error.Code != "NO_ELIGIBLE_TICKETS" {
		return fmt.Errorf("scenario E: expected NO_ELIGIBLE_TICKETS, got %s", callErr.Error.Code)
	}

	log.Logf("Scenario E PASSED")
	return nil
}

// RunScenarioF executes Scenario F — Operator Live Ticket Creation.
func RunScenarioF(ctx context.Context, client *Client, log Logger) error {
	if log == nil {
		log = DefaultLogger
	}
	log.Logf("Running Scenario F: Live Queue Ticket Creation by Operator")

	// 1. Preflight clean environment
	if err := PreflightCleanEnvironment(ctx, client); err != nil {
		return fmt.Errorf("scenario F preflight failed: %w", err)
	}

	// 2. Create Live Ticket
	idemKey := fmt.Sprintf("qa-sprint2-scenF-%d", time.Now().UnixNano())
	ticket, errResp, status, err := client.CreateLiveTicket(ctx, Window1ID, DemoBranchID, ParcelsServiceID, idemKey)
	if err != nil || status != http.StatusCreated || ticket == nil {
		return fmt.Errorf("scenario F: CreateLiveTicket failed (status=%d, errResp=%v): %w", status, errResp, err)
	}

	if ticket.Source != "LIVE" {
		return fmt.Errorf("scenario F: expected source 'LIVE', got %q", ticket.Source)
	}
	if ticket.Status != "WAITING" {
		return fmt.Errorf("scenario F: expected status 'WAITING', got %q", ticket.Status)
	}
	if ticket.Window != nil {
		return fmt.Errorf("scenario F: expected nil window for WAITING ticket, got %+v", ticket.Window)
	}

	// 3. Replay check
	replayed, errResp, status, err := client.CreateLiveTicket(ctx, Window1ID, DemoBranchID, ParcelsServiceID, idemKey)
	if err != nil || (status != http.StatusOK && status != http.StatusCreated) || replayed == nil {
		return fmt.Errorf("scenario F: Idempotent replay failed (status=%d, errResp=%v): %w", status, errResp, err)
	}
	if replayed.ID != ticket.ID {
		return fmt.Errorf("scenario F: replay returned different ticket ID (%s vs %s)", replayed.ID, ticket.ID)
	}

	// Conflict check: same key, different serviceId
	_, conflictErrResp, status, err := client.CreateLiveTicket(ctx, Window1ID, DemoBranchID, PaymentsServiceID, idemKey)
	if err != nil || status != http.StatusConflict || conflictErrResp == nil {
		return fmt.Errorf("scenario F: expected 409 on conflict key, got status=%d, err=%v", status, err)
	}
	if conflictErrResp.Error.Code != "IDEMPOTENCY_CONFLICT" {
		return fmt.Errorf("scenario F: expected IDEMPOTENCY_CONFLICT, got %s", conflictErrResp.Error.Code)
	}

	// 4. Operator calls the live ticket
	called, errResp, status, err := client.CallNext(ctx, Window1ID)
	if err != nil || status != http.StatusOK || called == nil {
		return fmt.Errorf("scenario F: CallNext failed (status=%d, errResp=%v): %w", status, errResp, err)
	}
	if called.ID != ticket.ID {
		return fmt.Errorf("scenario F: CallNext called unexpected ticket %s, want %s", called.ID, ticket.ID)
	}
	if called.Status != "CALLED" {
		return fmt.Errorf("scenario F: expected status CALLED, got %s", called.Status)
	}
	if called.Window == nil || called.Window.ID != Window1ID {
		return fmt.Errorf("scenario F: expected window %s, got %+v", Window1ID, called.Window)
	}

	// 5. Operator starts service
	started, errResp, status, err := client.StartService(ctx, ticket.ID)
	if err != nil || status != http.StatusOK || started == nil {
		return fmt.Errorf("scenario F: StartService failed (status=%d, errResp=%v): %w", status, errResp, err)
	}
	if started.Status != "SERVING" {
		return fmt.Errorf("scenario F: expected status SERVING, got %s", started.Status)
	}

	// 6. Operator completes service
	completed, errResp, status, err := client.CompleteService(ctx, ticket.ID)
	if err != nil || status != http.StatusOK || completed == nil {
		return fmt.Errorf("scenario F: CompleteService failed (status=%d, errResp=%v): %w", status, errResp, err)
	}
	if completed.Status != "COMPLETED" {
		return fmt.Errorf("scenario F: expected status COMPLETED, got %s", completed.Status)
	}

	// 7. Verify Window 1 is clean
	curTicket, _, status, err := client.GetCurrentTicket(ctx, Window1ID)
	if err != nil || status != http.StatusNoContent || curTicket != nil {
		return fmt.Errorf("scenario F: expected 204 No Content for window 1, got status=%d", status)
	}

	log.Logf("Scenario F PASSED")
	return nil
}

// RunScenarioG executes Scenario G — Return to queue and redirection to another service.
func RunScenarioG(ctx context.Context, client *Client, log Logger) error {
	if log == nil {
		log = DefaultLogger
	}
	log.Logf("Running Scenario G: Return to Queue and Redirection")

	// 1. Preflight clean environment
	if err := PreflightCleanEnvironment(ctx, client); err != nil {
		return fmt.Errorf("scenario G preflight failed: %w", err)
	}

	// 2. Create regular QR ticket for PARCELS
	idemKey := fmt.Sprintf("qa-sprint2-scenG-qr-%d", time.Now().UnixNano())
	ticket, errResp, status, err := client.CreateQRTicket(ctx, DemoBranchID, ParcelsServiceID, idemKey)
	if err != nil || status != http.StatusCreated || ticket == nil {
		return fmt.Errorf("scenario G: CreateQRTicket failed (status=%d, errResp=%v): %w", status, errResp, err)
	}
	originalQueueEnteredAt := ticket.QueueEnteredAt

	// 3. Call ticket at Window 1 (PARCELS)
	called, errResp, status, err := client.CallNext(ctx, Window1ID)
	if err != nil || status != http.StatusOK || called == nil {
		return fmt.Errorf("scenario G: CallNext failed (status=%d, errResp=%v): %w", status, errResp, err)
	}
	if called.ID != ticket.ID || called.Status != "CALLED" {
		return fmt.Errorf("scenario G: unexpected called ticket state: %+v", called)
	}

	// 4. Returning from wrong window fails with 409
	_, wrongWinErr, status, err := client.ReturnTicket(ctx, ticket.ID, Window2ID)
	if err != nil || status != http.StatusConflict || wrongWinErr == nil {
		return fmt.Errorf("scenario G: expected 409 when returning from wrong window, got status=%d, err=%v", status, err)
	}

	// 5. Return ticket from Window 1
	returned, errResp, status, err := client.ReturnTicket(ctx, ticket.ID, Window1ID)
	if err != nil || status != http.StatusOK || returned == nil {
		return fmt.Errorf("scenario G: ReturnTicket failed (status=%d, errResp=%v): %w", status, errResp, err)
	}
	if returned.Status != "WAITING" {
		return fmt.Errorf("scenario G: expected status WAITING after return, got %s", returned.Status)
	}
	if returned.Window != nil {
		return fmt.Errorf("scenario G: expected nil window after return, got %+v", returned.Window)
	}
	if returned.QueueEnteredAt != originalQueueEnteredAt {
		return fmt.Errorf("scenario G: queueEnteredAt changed on return (%s vs %s)", returned.QueueEnteredAt, originalQueueEnteredAt)
	}

	// Window 1 is now free
	cur, _, status, err := client.GetCurrentTicket(ctx, Window1ID)
	if err != nil || status != http.StatusNoContent || cur != nil {
		return fmt.Errorf("scenario G: expected Window 1 free after return, got status=%d", status)
	}

	// 6. Call ticket again at Window 1
	calledAgain, errResp, status, err := client.CallNext(ctx, Window1ID)
	if err != nil || status != http.StatusOK || calledAgain == nil {
		return fmt.Errorf("scenario G: CallNext after return failed (status=%d, errResp=%v): %w", status, errResp, err)
	}
	if calledAgain.ID != ticket.ID {
		return fmt.Errorf("scenario G: expected called ticket %s, got %s", ticket.ID, calledAgain.ID)
	}

	// 7. Start service
	started, errResp, status, err := client.StartService(ctx, ticket.ID)
	if err != nil || status != http.StatusOK || started == nil {
		return fmt.Errorf("scenario G: StartService failed: %w", err)
	}

	// 8. Redirect ticket to PAYMENTS
	redirected, errResp, status, err := client.RedirectTicket(ctx, ticket.ID, Window1ID, PaymentsServiceID)
	if err != nil || status != http.StatusOK || redirected == nil {
		return fmt.Errorf("scenario G: RedirectTicket failed (status=%d, errResp=%v): %w", status, errResp, err)
	}
	if redirected.Status != "WAITING" {
		return fmt.Errorf("scenario G: expected status WAITING after redirect, got %s", redirected.Status)
	}
	if redirected.ServiceID != PaymentsServiceID {
		return fmt.Errorf("scenario G: expected serviceId %s after redirect, got %s", PaymentsServiceID, redirected.ServiceID)
	}
	if redirected.Window != nil {
		return fmt.Errorf("scenario G: expected nil window after redirect, got %+v", redirected.Window)
	}
	if redirected.QueueEnteredAt != originalQueueEnteredAt {
		return fmt.Errorf("scenario G: queueEnteredAt changed on redirect (%s vs %s)", redirected.QueueEnteredAt, originalQueueEnteredAt)
	}

	// Window 1 is now free
	cur, _, status, err = client.GetCurrentTicket(ctx, Window1ID)
	if err != nil || status != http.StatusNoContent || cur != nil {
		return fmt.Errorf("scenario G: expected Window 1 free after redirect, got status=%d", status)
	}

	// 9. Window 1 (PARCELS only) cannot call the redirected ticket
	_, w1Err, status, err := client.CallNext(ctx, Window1ID)
	if err != nil || status != http.StatusConflict || w1Err == nil || w1Err.Error.Code != "NO_ELIGIBLE_TICKETS" {
		return fmt.Errorf("scenario G: expected NO_ELIGIBLE_TICKETS on Window 1, got status=%d, errResp=%v", status, w1Err)
	}

	// 10. Window 2 (PAYMENTS) calls the redirected ticket
	calledWin2, errResp, status, err := client.CallNext(ctx, Window2ID)
	if err != nil || status != http.StatusOK || calledWin2 == nil {
		return fmt.Errorf("scenario G: Window 2 CallNext failed (status=%d, errResp=%v): %w", status, errResp, err)
	}
	if calledWin2.ID != ticket.ID {
		return fmt.Errorf("scenario G: expected Window 2 to call ticket %s, got %s", ticket.ID, calledWin2.ID)
	}
	if calledWin2.Window == nil || calledWin2.Window.ID != Window2ID {
		return fmt.Errorf("scenario G: expected ticket window %s, got %+v", Window2ID, calledWin2.Window)
	}

	// 11. Complete service at Window 2
	_, _, _, _ = client.StartService(ctx, ticket.ID)
	completed, errResp, status, err := client.CompleteService(ctx, ticket.ID)
	if err != nil || status != http.StatusOK || completed == nil || completed.Status != "COMPLETED" {
		return fmt.Errorf("scenario G: CompleteService failed at Window 2: %w", err)
	}

	log.Logf("Scenario G PASSED")
	return nil
}

// RunScenarioH executes Scenario H — Priority Scheduling: Due appointments called ahead of regular queue.
func RunScenarioH(ctx context.Context, client *Client, log Logger) error {
	if log == nil {
		log = DefaultLogger
	}
	log.Logf("Running Scenario H: Priority Scheduling (Due Appointments vs Live/QR)")

	// 1. Preflight clean environment
	if err := PreflightCleanEnvironment(ctx, client); err != nil {
		return fmt.Errorf("scenario H preflight failed: %w", err)
	}

	// 2. Create regular WAITING ticket entered queue at T1
	idemWait := fmt.Sprintf("qa-sprint2-scenH-wait-%d", time.Now().UnixNano())
	waitTicket, errResp, status, err := client.CreateQRTicket(ctx, DemoBranchID, ParcelsServiceID, idemWait)
	if err != nil || status != http.StatusCreated || waitTicket == nil {
		return fmt.Errorf("scenario H: CreateQRTicket failed (status=%d, errResp=%v): %w", status, errResp, err)
	}

	// Ensure chronological separation
	time.Sleep(50 * time.Millisecond)

	// 3. Create due APPOINTMENT ticket (scheduled time in past or right now)
	schedPast := time.Now().UTC().Add(-1 * time.Minute).Truncate(time.Second).Format(time.RFC3339)
	idemApt := fmt.Sprintf("qa-sprint2-scenH-apt-%d", time.Now().UnixNano())
	aptTicket, errResp, status, err := client.CreateAppointment(ctx, DemoBranchID, ParcelsServiceID, schedPast, idemApt)
	if err != nil || status != http.StatusCreated || aptTicket == nil {
		return fmt.Errorf("scenario H: CreateAppointment failed (status=%d, errResp=%v): %w", status, errResp, err)
	}

	// 4. Window 1 calls next: MUST prioritize aptTicket (rank 0: APPOINTMENT scheduled_time <= now)
	c1, errResp, status, err := client.CallNext(ctx, Window1ID)
	if err != nil || status != http.StatusOK || c1 == nil {
		return fmt.Errorf("scenario H: First CallNext failed (status=%d, errResp=%v): %w", status, errResp, err)
	}
	if c1.ID != aptTicket.ID {
		return fmt.Errorf("scenario H: priority violation! Expected appointment ticket %s to be called first, but got %s", aptTicket.ID, c1.ID)
	}

	// Settle first ticket
	_, _, _, _ = client.StartService(ctx, c1.ID)
	_, _, _, _ = client.CompleteService(ctx, c1.ID)

	// 5. Window 1 calls next: MUST now call waitTicket (rank 1: WAITING)
	c2, errResp, status, err := client.CallNext(ctx, Window1ID)
	if err != nil || status != http.StatusOK || c2 == nil {
		return fmt.Errorf("scenario H: Second CallNext failed (status=%d, errResp=%v): %w", status, errResp, err)
	}
	if c2.ID != waitTicket.ID {
		return fmt.Errorf("scenario H: expected waiting ticket %s to be called second, but got %s", waitTicket.ID, c2.ID)
	}

	// Settle second ticket
	_, _, _, _ = client.StartService(ctx, c2.ID)
	_, _, _, _ = client.CompleteService(ctx, c2.ID)

	// 6. Window 1 calls next: queue must be empty
	_, emptyErr, status, err := client.CallNext(ctx, Window1ID)
	if err != nil || status != http.StatusConflict || emptyErr == nil || emptyErr.Error.Code != "NO_ELIGIBLE_TICKETS" {
		return fmt.Errorf("scenario H: expected NO_ELIGIBLE_TICKETS on third call, got status=%d, errResp=%v", status, emptyErr)
	}

	log.Logf("Scenario H PASSED")
	return nil
}
