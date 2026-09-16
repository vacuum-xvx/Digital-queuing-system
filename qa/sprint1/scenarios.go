package sprint1qa

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

// RunScenarioA executes Scenario A — Happy Path.
func RunScenarioA(ctx context.Context, client *Client, log Logger) error {
	if log == nil {
		log = DefaultLogger
	}
	log.Logf("Running Scenario A: Happy Path")

	// 1. Preflight clean environment
	if err := PreflightCleanEnvironment(ctx, client); err != nil {
		return fmt.Errorf("scenario A preflight failed: %w", err)
	}

	// 2. GET Branches
	branches, bStatus, err := client.ListBranches(ctx)
	if err != nil || bStatus != http.StatusOK {
		return fmt.Errorf("scenario A: GET /api/v1/branches failed (status=%d): %w", bStatus, err)
	}
	var demoBranchFound bool
	for _, b := range branches.Items {
		if b.ID == DemoBranchID {
			demoBranchFound = true
			if b.Name == "" {
				return fmt.Errorf("scenario A: demo branch name is empty")
			}
			break
		}
	}
	if !demoBranchFound {
		return fmt.Errorf("scenario A: demo branch %s not found in branches list: %+v", DemoBranchID, branches.Items)
	}

	// 3. GET Branch Services
	services, sStatus, err := client.ListBranchServices(ctx, DemoBranchID)
	if err != nil || sStatus != http.StatusOK {
		return fmt.Errorf("scenario A: GET /api/v1/branches/%s/services failed (status=%d): %w", DemoBranchID, sStatus, err)
	}
	var parcelsFound, paymentsFound bool
	for _, s := range services.Items {
		if s.ID == ParcelsServiceID && s.Code == "PARCELS" && s.Name == "Посылки" {
			parcelsFound = true
		}
		if s.ID == PaymentsServiceID && s.Code == "PAYMENTS" && s.Name == "Платежи" {
			paymentsFound = true
		}
	}
	if !parcelsFound {
		return fmt.Errorf("scenario A: PARCELS service not properly found in %+v", services.Items)
	}
	if !paymentsFound {
		return fmt.Errorf("scenario A: PAYMENTS service not properly found in %+v", services.Items)
	}

	// 4. POST QR PARCELS using unique Idempotency-Key
	idemKey := fmt.Sprintf("qa-sprint1-scenA-%d", time.Now().UnixNano())
	ticket, errResp, createStatus, err := client.CreateQRTicket(ctx, DemoBranchID, ParcelsServiceID, idemKey)
	if err != nil || createStatus != http.StatusCreated || ticket == nil {
		return fmt.Errorf("scenario A: POST QR ticket failed (status=%d, errResp=%v): %w", createStatus, errResp, err)
	}

	// Deferred cleanup ensures no active/waiting ticket remains even if subsequent assertions fail
	var completedNormally bool
	createdTicketID := ticket.ID
	defer func() {
		if !completedNormally {
			_ = EnsureTicketCompleted(context.Background(), client, createdTicketID, Window1ID, Window3ID)
		}
	}()

	if ticket.Source != "QR" {
		return fmt.Errorf("scenario A: expected ticket source 'QR', got %q", ticket.Source)
	}
	if ticket.Status != "WAITING" {
		return fmt.Errorf("scenario A: expected ticket status 'WAITING', got %q", ticket.Status)
	}
	if ticket.BranchID != DemoBranchID {
		return fmt.Errorf("scenario A: branchId mismatch: expected %s, got %s", DemoBranchID, ticket.BranchID)
	}
	if ticket.ServiceID != ParcelsServiceID {
		return fmt.Errorf("scenario A: serviceId mismatch: expected %s, got %s", ParcelsServiceID, ticket.ServiceID)
	}
	if ticket.Window != nil {
		return fmt.Errorf("scenario A: expected ticket.Window to be nil for WAITING ticket, got %+v", ticket.Window)
	}

	// 5. POST Window 1 call-next
	calledTicket, callErrResp, callStatus, err := client.CallNext(ctx, Window1ID)
	if err != nil || callStatus != http.StatusOK || calledTicket == nil {
		return fmt.Errorf("scenario A: Window 1 call-next failed (status=%d, errResp=%v): %w", callStatus, callErrResp, err)
	}
	if calledTicket.ID != createdTicketID {
		return fmt.Errorf("scenario A: called ticket ID mismatch: expected %s, got %s", createdTicketID, calledTicket.ID)
	}
	if calledTicket.Status != "CALLED" {
		return fmt.Errorf("scenario A: expected called status 'CALLED', got %q", calledTicket.Status)
	}
	if calledTicket.Window == nil || calledTicket.Window.ID != Window1ID || calledTicket.Window.Number != 1 {
		return fmt.Errorf("scenario A: Window assignment mismatch: %+v", calledTicket.Window)
	}

	// 6. GET Ticket -> CALLED
	fetchedTicket, getErrResp, getStatus, err := client.GetTicket(ctx, createdTicketID)
	if err != nil || getStatus != http.StatusOK || fetchedTicket == nil {
		return fmt.Errorf("scenario A: GET ticket failed (status=%d, errResp=%v): %w", getStatus, getErrResp, err)
	}
	if fetchedTicket.Status != "CALLED" {
		return fmt.Errorf("scenario A: expected fetched status 'CALLED', got %q", fetchedTicket.Status)
	}

	// 7. POST start -> SERVING
	startedTicket, startErrResp, startStatus, err := client.StartService(ctx, createdTicketID)
	if err != nil || startStatus != http.StatusOK || startedTicket == nil {
		return fmt.Errorf("scenario A: start service failed (status=%d, errResp=%v): %w", startStatus, startErrResp, err)
	}
	if startedTicket.Status != "SERVING" {
		return fmt.Errorf("scenario A: expected status 'SERVING', got %q", startedTicket.Status)
	}
	if startedTicket.ServiceStartedAt == nil {
		return fmt.Errorf("scenario A: expected serviceStartedAt to be set")
	}

	// 8. POST complete -> COMPLETED
	completedTicket, compErrResp, compStatus, err := client.CompleteService(ctx, createdTicketID)
	if err != nil || compStatus != http.StatusOK || completedTicket == nil {
		return fmt.Errorf("scenario A: complete service failed (status=%d, errResp=%v): %w", compStatus, compErrResp, err)
	}
	if completedTicket.Status != "COMPLETED" {
		return fmt.Errorf("scenario A: expected status 'COMPLETED', got %q", completedTicket.Status)
	}
	if completedTicket.CompletedAt == nil {
		return fmt.Errorf("scenario A: expected completedAt to be set")
	}

	// 9. GET Ticket -> COMPLETED
	finalTicket, fErrResp, fStatus, err := client.GetTicket(ctx, createdTicketID)
	if err != nil || fStatus != http.StatusOK || finalTicket == nil {
		return fmt.Errorf("scenario A: final GET ticket failed (status=%d, errResp=%v): %w", fStatus, fErrResp, err)
	}
	if finalTicket.Status != "COMPLETED" {
		return fmt.Errorf("scenario A: expected final ticket status 'COMPLETED', got %q", finalTicket.Status)
	}

	// 10. Verify Window 1 has no current ticket (204)
	curTicket, curErrResp, curStatus, err := client.GetCurrentTicket(ctx, Window1ID)
	if err != nil || curStatus != http.StatusNoContent {
		return fmt.Errorf("scenario A: expected Window 1 current ticket 204 No Content, got status=%d (ticket=%+v, errResp=%v): %w", curStatus, curTicket, curErrResp, err)
	}

	completedNormally = true
	log.Logf("Scenario A PASSED")
	return nil
}

// RunScenarioB executes Scenario B — Idempotency.
func RunScenarioB(ctx context.Context, client *Client, log Logger) error {
	if log == nil {
		log = DefaultLogger
	}
	log.Logf("Running Scenario B: Idempotency")

	// 1. Preflight clean environment
	if err := PreflightCleanEnvironment(ctx, client); err != nil {
		return fmt.Errorf("scenario B preflight failed: %w", err)
	}

	// 2. Generate unique key K
	idemKey := fmt.Sprintf("qa-sprint1-scenB-%d", time.Now().UnixNano())

	// 3. POST PARCELS QR with K
	ticket1, errResp1, status1, err := client.CreateQRTicket(ctx, DemoBranchID, ParcelsServiceID, idemKey)
	if err != nil || status1 != http.StatusCreated || ticket1 == nil {
		return fmt.Errorf("scenario B: first QR create failed (status=%d, errResp=%v): %w", status1, errResp1, err)
	}

	var completedNormally bool
	createdTicketID := ticket1.ID
	defer func() {
		if !completedNormally {
			_ = EnsureTicketCompleted(context.Background(), client, createdTicketID, Window1ID, Window3ID)
		}
	}()

	if ticket1.Status != "WAITING" {
		return fmt.Errorf("scenario B: expected status 'WAITING', got %q", ticket1.Status)
	}

	// 4. Repeat exact POST PARCELS with K
	ticket2, errResp2, status2, err := client.CreateQRTicket(ctx, DemoBranchID, ParcelsServiceID, idemKey)
	if err != nil || status2 != http.StatusOK || ticket2 == nil {
		return fmt.Errorf("scenario B: repeat exact QR create failed (status=%d, errResp=%v): %w", status2, errResp2, err)
	}
	if ticket2.ID != ticket1.ID {
		return fmt.Errorf("scenario B: replayed ticket ID mismatch: expected %s, got %s", ticket1.ID, ticket2.ID)
	}
	if ticket2.PublicNumber != ticket1.PublicNumber {
		return fmt.Errorf("scenario B: replayed publicNumber mismatch: expected %s, got %s", ticket1.PublicNumber, ticket2.PublicNumber)
	}
	if ticket2.Status != "WAITING" {
		return fmt.Errorf("scenario B: replayed ticket status mismatch: expected 'WAITING', got %q", ticket2.Status)
	}

	// 5. POST same key K but Service=PAYMENTS
	ticket3, errResp3, status3, err := client.CreateQRTicket(ctx, DemoBranchID, PaymentsServiceID, idemKey)
	if err != nil {
		return fmt.Errorf("scenario B: conflicting QR create network error: %w", err)
	}
	if status3 != http.StatusConflict {
		return fmt.Errorf("scenario B: expected HTTP 409 Conflict for different service, got status=%d (ticket=%+v)", status3, ticket3)
	}
	if errResp3 == nil || errResp3.Error.Code != "IDEMPOTENCY_CONFLICT" {
		return fmt.Errorf("scenario B: expected error code IDEMPOTENCY_CONFLICT, got %+v", errResp3)
	}

	// 6. Scenario B cleanup: Move original ticket to COMPLETED via public API
	called, callErr, callStatus, err := client.CallNext(ctx, Window1ID)
	if err != nil || callStatus != http.StatusOK || called == nil {
		return fmt.Errorf("scenario B cleanup: Window 1 call-next failed (status=%d, errResp=%v): %w", callStatus, callErr, err)
	}
	if called.ID != ticket1.ID {
		return fmt.Errorf("scenario B cleanup: called ticket ID %s != created ticket ID %s", called.ID, ticket1.ID)
	}

	_, _, startStatus, err := client.StartService(ctx, ticket1.ID)
	if err != nil || startStatus != http.StatusOK {
		return fmt.Errorf("scenario B cleanup: start service failed (status=%d): %w", startStatus, err)
	}

	_, _, compStatus, err := client.CompleteService(ctx, ticket1.ID)
	if err != nil || compStatus != http.StatusOK {
		return fmt.Errorf("scenario B cleanup: complete service failed (status=%d): %w", compStatus, err)
	}

	finalTicket, _, fStatus, err := client.GetTicket(ctx, ticket1.ID)
	if err != nil || fStatus != http.StatusOK || finalTicket == nil || finalTicket.Status != "COMPLETED" {
		return fmt.Errorf("scenario B cleanup: ticket not in COMPLETED state: %+v", finalTicket)
	}

	completedNormally = true
	log.Logf("Scenario B PASSED")
	return nil
}

// RunScenarioC executes Scenario C — Service Routing.
func RunScenarioC(ctx context.Context, client *Client, log Logger) error {
	if log == nil {
		log = DefaultLogger
	}
	log.Logf("Running Scenario C: Service Routing")

	// 1. Preflight clean environment
	if err := PreflightCleanEnvironment(ctx, client); err != nil {
		return fmt.Errorf("scenario C preflight failed: %w", err)
	}

	// 2. Create one PARCELS QR Ticket
	idemKey := fmt.Sprintf("qa-sprint1-scenC-%d", time.Now().UnixNano())
	ticket, errResp, createStatus, err := client.CreateQRTicket(ctx, DemoBranchID, ParcelsServiceID, idemKey)
	if err != nil || createStatus != http.StatusCreated || ticket == nil {
		return fmt.Errorf("scenario C: create PARCELS ticket failed (status=%d, errResp=%v): %w", createStatus, errResp, err)
	}

	var completedNormally bool
	createdTicketID := ticket.ID
	defer func() {
		if !completedNormally {
			_ = EnsureTicketCompleted(context.Background(), client, createdTicketID, Window1ID, Window3ID)
		}
	}()

	if ticket.Status != "WAITING" {
		return fmt.Errorf("scenario C: expected status 'WAITING', got %q", ticket.Status)
	}

	// 3. POST Window 2 (PAYMENTS only) call-next -> must return 409 NO_ELIGIBLE_TICKETS
	w2Called, w2ErrResp, w2Status, err := client.CallNext(ctx, Window2ID)
	if err != nil {
		return fmt.Errorf("scenario C: Window 2 call-next network error: %w", err)
	}
	if w2Status != http.StatusConflict {
		return fmt.Errorf("scenario C: expected HTTP 409 Conflict from Window 2 on PARCELS ticket, got status=%d (ticket=%+v)", w2Status, w2Called)
	}
	if w2ErrResp == nil || w2ErrResp.Error.Code != "NO_ELIGIBLE_TICKETS" {
		return fmt.Errorf("scenario C: expected error code NO_ELIGIBLE_TICKETS from Window 2, got %+v", w2ErrResp)
	}

	// 4. GET Ticket -> Assert still WAITING; window = null
	tAfterW2, getErr, getStatus, err := client.GetTicket(ctx, createdTicketID)
	if err != nil || getStatus != http.StatusOK || tAfterW2 == nil {
		return fmt.Errorf("scenario C: GET ticket after Window 2 attempt failed (status=%d, errResp=%v): %w", getStatus, getErr, err)
	}
	if tAfterW2.Status != "WAITING" {
		return fmt.Errorf("scenario C: expected ticket to remain 'WAITING', got %q", tAfterW2.Status)
	}
	if tAfterW2.Window != nil {
		return fmt.Errorf("scenario C: expected window to be null, got %+v", tAfterW2.Window)
	}

	// 5. POST Window 1 (PARCELS supported) call-next -> HTTP 200, status CALLED, Window 1 assigned
	w1Called, w1ErrResp, w1Status, err := client.CallNext(ctx, Window1ID)
	if err != nil || w1Status != http.StatusOK || w1Called == nil {
		return fmt.Errorf("scenario C: Window 1 call-next failed (status=%d, errResp=%v): %w", w1Status, w1ErrResp, err)
	}
	if w1Called.ID != createdTicketID {
		return fmt.Errorf("scenario C: Window 1 called ticket ID mismatch: expected %s, got %s", createdTicketID, w1Called.ID)
	}
	if w1Called.Status != "CALLED" {
		return fmt.Errorf("scenario C: expected status 'CALLED', got %q", w1Called.Status)
	}
	if w1Called.Window == nil || w1Called.Window.ID != Window1ID {
		return fmt.Errorf("scenario C: expected Window 1 assigned, got %+v", w1Called.Window)
	}

	// 6. Start and complete
	_, _, startStatus, err := client.StartService(ctx, createdTicketID)
	if err != nil || startStatus != http.StatusOK {
		return fmt.Errorf("scenario C: start service failed (status=%d): %w", startStatus, err)
	}

	_, _, compStatus, err := client.CompleteService(ctx, createdTicketID)
	if err != nil || compStatus != http.StatusOK {
		return fmt.Errorf("scenario C: complete service failed (status=%d): %w", compStatus, err)
	}

	// 7. Assert COMPLETED
	finalTicket, _, fStatus, err := client.GetTicket(ctx, createdTicketID)
	if err != nil || fStatus != http.StatusOK || finalTicket == nil || finalTicket.Status != "COMPLETED" {
		return fmt.Errorf("scenario C: ticket not in COMPLETED state: %+v", finalTicket)
	}

	// 8. Verify Window 2 has no active ticket (204)
	w2Cur, _, w2CurStatus, err := client.GetCurrentTicket(ctx, Window2ID)
	if err != nil || w2CurStatus != http.StatusNoContent {
		return fmt.Errorf("scenario C: Window 2 current ticket expected 204, got status=%d (body=%+v)", w2CurStatus, w2Cur)
	}

	completedNormally = true
	log.Logf("Scenario C PASSED")
	return nil
}

// RunScenarioD executes Scenario D — Concurrent Claim.
func RunScenarioD(ctx context.Context, client *Client, log Logger) error {
	if log == nil {
		log = DefaultLogger
	}
	log.Logf("Running Scenario D: Concurrent Claim")

	// 1. Preflight clean environment
	if err := PreflightCleanEnvironment(ctx, client); err != nil {
		return fmt.Errorf("scenario D preflight failed: %w", err)
	}

	// 2. Confirm Window 1 and Window 3 support PARCELS, and both have no current ticket
	w1Cur, _, w1CurStatus, err := client.GetCurrentTicket(ctx, Window1ID)
	if err != nil || w1CurStatus != http.StatusNoContent {
		return fmt.Errorf("scenario D: Window 1 not empty before test (status=%d, ticket=%+v): %w", w1CurStatus, w1Cur, err)
	}
	w3Cur, _, w3CurStatus, err := client.GetCurrentTicket(ctx, Window3ID)
	if err != nil || w3CurStatus != http.StatusNoContent {
		return fmt.Errorf("scenario D: Window 3 not empty before test (status=%d, ticket=%+v): %w", w3CurStatus, w3Cur, err)
	}

	// 3. Create exactly one PARCELS QR Ticket
	idemKey := fmt.Sprintf("qa-sprint1-scenD-%d", time.Now().UnixNano())
	ticket, errResp, createStatus, err := client.CreateQRTicket(ctx, DemoBranchID, ParcelsServiceID, idemKey)
	if err != nil || createStatus != http.StatusCreated || ticket == nil {
		return fmt.Errorf("scenario D: create PARCELS ticket failed (status=%d, errResp=%v): %w", createStatus, errResp, err)
	}

	var completedNormally bool
	createdTicketID := ticket.ID
	defer func() {
		if !completedNormally {
			_ = EnsureTicketCompleted(context.Background(), client, createdTicketID, Window1ID, Window3ID)
		}
	}()

	if ticket.Status != "WAITING" {
		return fmt.Errorf("scenario D: expected status 'WAITING', got %q", ticket.Status)
	}

	// 4. From two goroutines send simultaneously: Window 1 call-next, Window 3 call-next
	type callResult struct {
		windowID string
		ticket   *TicketDTO
		errResp  *ErrorResponse
		status   int
		err      error
	}

	results := make(chan callResult, 2)
	startGate := make(chan struct{})
	var wg sync.WaitGroup
	wg.Add(2)

	go func() {
		defer wg.Done()
		<-startGate
		t, e, s, err := client.CallNext(ctx, Window1ID)
		results <- callResult{windowID: Window1ID, ticket: t, errResp: e, status: s, err: err}
	}()

	go func() {
		defer wg.Done()
		<-startGate
		t, e, s, err := client.CallNext(ctx, Window3ID)
		results <- callResult{windowID: Window3ID, ticket: t, errResp: e, status: s, err: err}
	}()

	// Release both requests at the same instant
	close(startGate)
	wg.Wait()
	close(results)

	var res1, res2 callResult
	res1 = <-results
	res2 = <-results

	if res1.err != nil {
		return fmt.Errorf("scenario D: network error on call-next window %s: %w", res1.windowID, res1.err)
	}
	if res2.err != nil {
		return fmt.Errorf("scenario D: network error on call-next window %s: %w", res2.windowID, res2.err)
	}

	log.Logf("Concurrent call results: Window %s -> status %d, Window %s -> status %d", res1.windowID, res1.status, res2.windowID, res2.status)

	// Check concurrency guarantees:
	// If both are 200 with same Ticket -> CRITICAL FAIL
	if res1.status == http.StatusOK && res2.status == http.StatusOK {
		if res1.ticket != nil && res2.ticket != nil && res1.ticket.ID == res2.ticket.ID {
			return fmt.Errorf("CRITICAL FAIL: BOTH Window %s and Window %s claimed the SAME ticket %s!", res1.windowID, res2.windowID, res1.ticket.ID)
		}
		return fmt.Errorf("scenario D FAIL: both calls returned 200 with different tickets (res1=%+v, res2=%+v)", res1.ticket, res2.ticket)
	}

	// If both are 409 -> FAIL
	if res1.status == http.StatusConflict && res2.status == http.StatusConflict {
		return fmt.Errorf("scenario D FAIL: both calls returned 409 Conflict (res1=%+v, res2=%+v)", res1.errResp, res2.errResp)
	}

	// Expected: exactly one 200, exactly one 409 NO_ELIGIBLE_TICKETS
	var winner, loser callResult
	if res1.status == http.StatusOK {
		winner = res1
		loser = res2
	} else if res2.status == http.StatusOK {
		winner = res2
		loser = res1
	} else {
		return fmt.Errorf("scenario D: unexpected statuses: %s=%d, %s=%d", res1.windowID, res1.status, res2.windowID, res2.status)
	}

	if loser.status != http.StatusConflict || loser.errResp == nil || loser.errResp.Error.Code != "NO_ELIGIBLE_TICKETS" {
		return fmt.Errorf("scenario D: expected loser to receive 409 NO_ELIGIBLE_TICKETS, got status=%d, errResp=%+v", loser.status, loser.errResp)
	}

	if winner.ticket == nil || winner.ticket.ID != createdTicketID {
		return fmt.Errorf("scenario D: winning response does not match created ticket ID: expected %s, got %+v", createdTicketID, winner.ticket)
	}

	if winner.ticket.Window == nil || winner.ticket.Window.ID != winner.windowID {
		return fmt.Errorf("scenario D: winner ticket window does not match winning window %s: %+v", winner.windowID, winner.ticket.Window)
	}

	// GET Ticket shows exactly that one Window assignment
	getT, _, gStatus, err := client.GetTicket(ctx, createdTicketID)
	if err != nil || gStatus != http.StatusOK || getT == nil {
		return fmt.Errorf("scenario D: GET ticket after concurrent claim failed: %w", err)
	}
	if getT.Window == nil || getT.Window.ID != winner.windowID {
		return fmt.Errorf("scenario D: GET ticket assigned window %v != winner %s", getT.Window, winner.windowID)
	}

	// For winning Window: start; complete
	_, _, startStatus, err := client.StartService(ctx, createdTicketID)
	if err != nil || startStatus != http.StatusOK {
		return fmt.Errorf("scenario D: start service failed on ticket %s: %w", createdTicketID, err)
	}

	_, _, compStatus, err := client.CompleteService(ctx, createdTicketID)
	if err != nil || compStatus != http.StatusOK {
		return fmt.Errorf("scenario D: complete service failed on ticket %s: %w", createdTicketID, err)
	}

	finalT, _, fStatus, err := client.GetTicket(ctx, createdTicketID)
	if err != nil || fStatus != http.StatusOK || finalT == nil || finalT.Status != "COMPLETED" {
		return fmt.Errorf("scenario D: ticket not completed: %+v", finalT)
	}

	// Both Window 1 and Window 3 current-ticket endpoints must return 204
	w1Fin, _, w1FinStatus, err := client.GetCurrentTicket(ctx, Window1ID)
	if err != nil || w1FinStatus != http.StatusNoContent {
		return fmt.Errorf("scenario D: Window 1 current ticket not 204 at end (status=%d, body=%+v)", w1FinStatus, w1Fin)
	}
	w3Fin, _, w3FinStatus, err := client.GetCurrentTicket(ctx, Window3ID)
	if err != nil || w3FinStatus != http.StatusNoContent {
		return fmt.Errorf("scenario D: Window 3 current ticket not 204 at end (status=%d, body=%+v)", w3FinStatus, w3Fin)
	}

	completedNormally = true
	log.Logf("Scenario D PASSED (Winner: Window %s)", winner.windowID)
	return nil
}
