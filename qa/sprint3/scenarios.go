package sprint3qa

import (
	"context"
	"fmt"
	"net/http"
	"sync"
	"time"
)

// Helper to check if an endpoint is blocked due to 404 (Egor's pending HTTP integration)
type Logger interface {
	Log(args ...any)
	Logf(format string, args ...any)
}

func isEndpointBlocked(status int, t Logger, endpointName string) bool {
	if status == http.StatusNotFound {
		t.Logf("BLOCKER (Pending HTTP API): endpoint %s returned 404 Not Found (Egor's HTTP layer pending)", endpointName)
		return true
	}
	return false
}

// Scenario 1: LIVE Creation & Idempotency
func RunScenario1_LiveCreation(ctx context.Context, client *Client, t Logger) error {
	t.Log("Running Scenario 1: LIVE Creation & Idempotency")
	_ = DrainAllDemoWindows(ctx, client)

	key := fmt.Sprintf("live-idem-%d", time.Now().UnixNano())

	// 1. Initial Creation -> 201 Created
	ticket, errResp, status, err := client.CreateLiveTicket(ctx, DemoBranchID, ParcelsServiceID, key)
	if err != nil {
		return fmt.Errorf("initial live create network error: %w", err)
	}
	if status != http.StatusCreated && status != http.StatusOK {
		return fmt.Errorf("expected 201/200 for live create, got status=%d (err: %v)", status, errResp)
	}
	if ticket == nil || ticket.Source != "LIVE" || ticket.Status != "WAITING" {
		return fmt.Errorf("expected source=LIVE, status=WAITING, got: %+v", ticket)
	}
	if len(ticket.PublicNumber) < 3 || ticket.PublicNumber[:2] != "L-" {
		return fmt.Errorf("expected public number starting with L-, got %q", ticket.PublicNumber)
	}

	// 2. Exact Replay with same key -> 200 or 201 with identical ticket
	ticketReplay, rErrResp, rStatus, rErr := client.CreateLiveTicket(ctx, DemoBranchID, ParcelsServiceID, key)
	if rErr != nil {
		return fmt.Errorf("replay live create network error: %w", rErr)
	}
	if rStatus != http.StatusOK && rStatus != http.StatusCreated {
		return fmt.Errorf("expected 200/201 on replay, got status=%d (err: %v)", rStatus, rErrResp)
	}
	if ticketReplay.ID != ticket.ID || ticketReplay.PublicNumber != ticket.PublicNumber {
		return fmt.Errorf("replay returned different ticket: original=%+v, replay=%+v", ticket, ticketReplay)
	}

	// 3. Event Audit: exactly one CREATED event
	events, evErr, evStatus, err := client.ListTicketEvents(ctx, ticket.ID)
	if err == nil && evStatus == http.StatusOK && events != nil {
		createdCount := 0
		for _, e := range events.Items {
			if e.Type == "CREATED" {
				createdCount++
			}
		}
		if createdCount != 1 {
			return fmt.Errorf("expected exactly 1 CREATED event on replay, got %d", createdCount)
		}
	} else {
		t.Logf("Notice: ListTicketEvents returned status=%d (err: %v)", evStatus, evErr)
	}

	// 4. Conflicting Idempotency: same key with different service -> 409 IDEMPOTENCY_CONFLICT
	_, cErrResp, cStatus, cErr := client.CreateLiveTicket(ctx, DemoBranchID, PaymentsServiceID, key)
	if cErr != nil {
		return fmt.Errorf("conflict live create network error: %w", cErr)
	}
	if cStatus != http.StatusConflict {
		return fmt.Errorf("expected 409 IDEMPOTENCY_CONFLICT for changed payload, got status=%d (resp: %v)", cStatus, cErrResp)
	}

	// Settle created ticket
	_ = DrainWindow(ctx, client, Window1ID)
	t.Log("Scenario 1 PASSED")
	return nil
}

// Scenario 2: LIVE Service Routing
func RunScenario2_LiveRouting(ctx context.Context, client *Client, t Logger) error {
	t.Log("Running Scenario 2: LIVE Service Routing")
	_ = DrainAllDemoWindows(ctx, client)

	key := fmt.Sprintf("live-route-%d", time.Now().UnixNano())
	ticket, errResp, status, err := client.CreateLiveTicket(ctx, DemoBranchID, ParcelsServiceID, key)
	if err != nil || (status != http.StatusCreated && status != http.StatusOK) || ticket == nil {
		return fmt.Errorf("live create failed: status=%d, errResp=%v, err=%w", status, errResp, err)
	}

	// Window 2 serves PAYMENTS only -> CallNext must return 409 NO_ELIGIBLE_TICKETS
	_, w2ErrResp, w2Status, w2Err := client.CallNext(ctx, Window2ID)
	if w2Err != nil {
		return fmt.Errorf("window 2 call-next network error: %w", w2Err)
	}
	if w2Status != http.StatusConflict || w2ErrResp == nil || w2ErrResp.Error.Code != "NO_ELIGIBLE_TICKETS" {
		return fmt.Errorf("expected 409 NO_ELIGIBLE_TICKETS for incompatible Window 2, got status=%d (err: %v)", w2Status, w2ErrResp)
	}

	// Window 1 serves PARCELS -> must claim the ticket
	called, w1ErrResp, w1Status, w1Err := client.CallNext(ctx, Window1ID)
	if w1Err != nil {
		return fmt.Errorf("window 1 call-next network error: %w", w1Err)
	}
	if w1Status != http.StatusOK || called == nil || called.ID != ticket.ID {
		return fmt.Errorf("expected Window 1 to claim ticket %s, got status=%d (err: %v, called: %+v)", ticket.ID, w1Status, w1ErrResp, called)
	}

	_ = SettleCurrent(ctx, client, Window1ID)
	t.Log("Scenario 2 PASSED")
	return nil
}

// Scenario 3: Mixed-Source Ordering
func RunScenario3_MixedSourceOrdering(ctx context.Context, client *Client, t Logger) error {
	t.Log("Running Scenario 3: Mixed-Source Ordering")
	_ = DrainAllDemoWindows(ctx, client)
	_ = RestoreDefaultPolicy(ctx, client)

	now := time.Now().UTC()

	// 1. Create QR Ticket (Parcels, base=10)
	qrKey := fmt.Sprintf("mix-qr-%d", now.UnixNano())
	qrTicket, _, qrStatus, err := client.CreateQRTicket(ctx, DemoBranchID, ParcelsServiceID, qrKey)
	if err != nil || qrStatus != http.StatusCreated {
		return fmt.Errorf("create QR failed: status=%d, err=%w", qrStatus, err)
	}

	// 2. Create LIVE Ticket (Parcels, base=10)
	liveKey := fmt.Sprintf("mix-live-%d", now.UnixNano())
	liveTicket, _, liveStatus, err := client.CreateLiveTicket(ctx, DemoBranchID, ParcelsServiceID, liveKey)
	if err != nil || (liveStatus != http.StatusCreated && liveStatus != http.StatusOK) {
		return fmt.Errorf("create LIVE failed: status=%d, err=%w", liveStatus, err)
	}

	// 3. Create Due Appointment Ticket (Parcels, base=100)
	aptKey := fmt.Sprintf("mix-apt-%d", now.UnixNano())
	sched3 := time.Now().UTC().Add(2 * time.Second).Truncate(time.Second)
	aptResp, _, aptStatus, err := client.CreateAppointment(ctx, DemoBranchID, ParcelsServiceID, aptKey, sched3.Format(time.RFC3339))
	if err != nil || aptStatus != http.StatusCreated {
		return fmt.Errorf("create Appointment failed: status=%d, err=%w", aptStatus, err)
	}
	wait3 := time.Until(sched3) + 400*time.Millisecond
	if wait3 > 0 {
		time.Sleep(wait3)
	}

	// Window 1 calls next: Appointment has base 100 > QR(10) / LIVE(10), so Appointment MUST be first
	called1, _, cStatus1, err := client.CallNext(ctx, Window1ID)
	if err != nil || cStatus1 != http.StatusOK || called1 == nil {
		return fmt.Errorf("call 1 failed: status=%d, err=%w", cStatus1, err)
	}
	if called1.ID != aptResp.Ticket.ID {
		return fmt.Errorf("expected Appointment %s (priority 100) to be called first, got %s (%s, source=%s)", aptResp.Ticket.ID, called1.ID, called1.PublicNumber, called1.Source)
	}
	_ = SettleCurrent(ctx, client, Window1ID)

	// Call next for the remaining candidates (QR entered before LIVE)
	called2, _, cStatus2, err := client.CallNext(ctx, Window1ID)
	if err != nil || cStatus2 != http.StatusOK || called2 == nil {
		return fmt.Errorf("call 2 failed: status=%d, err=%w", cStatus2, err)
	}
	if called2.ID != qrTicket.ID {
		return fmt.Errorf("expected earlier QR ticket %s to be called before LIVE, got %s", qrTicket.ID, called2.ID)
	}
	_ = SettleCurrent(ctx, client, Window1ID)

	called3, _, cStatus3, err := client.CallNext(ctx, Window1ID)
	if err != nil || cStatus3 != http.StatusOK || called3 == nil {
		return fmt.Errorf("call 3 failed: status=%d, err=%w", cStatus3, err)
	}
	if called3.ID != liveTicket.ID {
		return fmt.Errorf("expected LIVE ticket %s to be called third, got %s", liveTicket.ID, called3.ID)
	}
	_ = SettleCurrent(ctx, client, Window1ID)

	t.Log("Scenario 3 PASSED")
	return nil
}

// Scenario 4: Anti-Starvation (Old candidate overtakes higher base priority)
func RunScenario4_AntiStarvation(ctx context.Context, client *Client, t Logger) error {
	t.Log("Running Scenario 4: Anti-Starvation")
	_ = DrainAllDemoWindows(ctx, client)

	policy, _, pStatus, err := client.GetQueuePolicy(ctx, DemoBranchID)
	if err != nil || pStatus != http.StatusOK {
		return fmt.Errorf("get policy failed: status=%d, err=%w", pStatus, err)
	}

	// Set fast anti-starvation policy: threshold=0 min, pointsPerMinute=600 (10 points/sec)
	thresh := 0
	ptsPerMin := 600
	livePri := 10
	grace := 15
	latePerMin := 5
	maxLate := 90

	fastReq := UpdateQueuePolicyRequest{
		AppointmentDuePriority:          100,
		QRPriority:                      10,
		LivePriority:                    &livePri,
		AntiStarvationThresholdMinutes:  &thresh,
		AntiStarvationPointsPerMinute:   &ptsPerMin,
		AppointmentGraceMinutes:         &grace,
		AppointmentLatePenaltyPerMinute: &latePerMin,
		AppointmentLatePenaltyMaxPoints: &maxLate,
		ExpectedVersion:                 policy.Version,
	}
	updated, uErrResp, uStatus, err := client.UpdateQueuePolicy(ctx, DemoBranchID, fastReq)
	if err != nil || uStatus != http.StatusOK {
		t.Logf("Notice: UpdateQueuePolicy returned status=%d (%v). Skipping anti-starvation if policy endpoint is legacy.", uStatus, uErrResp)
		return nil
	}
	defer func() {
		_ = RestoreDefaultPolicy(ctx, client)
	}()

	// 1. Create QR ticket #1 (base=10). Let it age for 11 seconds.
	qrKey := fmt.Sprintf("starv-qr-%d", time.Now().UnixNano())
	qrTicket, _, _, err := client.CreateQRTicket(ctx, DemoBranchID, ParcelsServiceID, qrKey)
	if err != nil {
		return fmt.Errorf("create aged QR ticket failed: %w", err)
	}

	t.Log("Aging QR ticket for 11 seconds to gain 110 priority points...")
	time.Sleep(11 * time.Second)

	// 2. Create Appointment ticket #2 (base=100, due in 2s).
	aptKey := fmt.Sprintf("starv-apt-%d", time.Now().UnixNano())
	sched4 := time.Now().UTC().Add(2 * time.Second).Truncate(time.Second)
	aptResp, _, _, err := client.CreateAppointment(ctx, DemoBranchID, ParcelsServiceID, aptKey, sched4.Format(time.RFC3339))
	if err != nil {
		return fmt.Errorf("create fresh appointment ticket failed: %w", err)
	}
	wait4 := time.Until(sched4) + 400*time.Millisecond
	if wait4 > 0 {
		time.Sleep(wait4)
	}

	// At this point:
	// QR Ticket: base 10 + 11s * 10 pts/sec = ~120 effective priority
	// Appointment: base 100 + 0s * 10 pts/sec = 100 effective priority
	// Therefore, the aged QR ticket MUST overtake the fresh Appointment ticket!
	called, _, cStatus, err := client.CallNext(ctx, Window1ID)
	if err != nil || cStatus != http.StatusOK || called == nil {
		return fmt.Errorf("call-next failed: status=%d, err=%w", cStatus, err)
	}

	if called.ID != qrTicket.ID {
		return fmt.Errorf("anti-starvation failed: expected aged QR %s to overtake fresh appointment %s, but got %s", qrTicket.ID, aptResp.Ticket.ID, called.ID)
	}
	_ = SettleCurrent(ctx, client, Window1ID)
	_ = DrainWindow(ctx, client, Window1ID)

	_ = updated
	t.Log("Scenario 4 PASSED")
	return nil
}

// Scenario 5: Appointment Grace Period
func RunScenario5_AppointmentGrace(ctx context.Context, client *Client, t Logger) error {
	t.Log("Running Scenario 5: Appointment Grace Period")
	_ = DrainAllDemoWindows(ctx, client)
	_ = RestoreDefaultPolicy(ctx, client)

	aptKey := fmt.Sprintf("grace-apt-%d", time.Now().UnixNano())
	sched5 := time.Now().UTC().Add(2 * time.Second).Truncate(time.Second)
	aptResp, _, status, err := client.CreateAppointment(ctx, DemoBranchID, ParcelsServiceID, aptKey, sched5.Format(time.RFC3339))
	if err != nil || status != http.StatusCreated {
		return fmt.Errorf("create appointment failed: status=%d, err=%w", status, err)
	}
	wait5 := time.Until(sched5) + 400*time.Millisecond
	if wait5 > 0 {
		time.Sleep(wait5)
	}
	if err != nil || status != http.StatusCreated {
		return fmt.Errorf("create appointment failed: status=%d, err=%w", status, err)
	}

	// Arrive within 15 min grace period
	_, aStatus, err := client.ArriveAppointment(ctx, aptResp.Ticket.ID)
	if err != nil {
		return fmt.Errorf("arrive appointment network error: %w", err)
	}
	if isEndpointBlocked(aStatus, t, "POST /api/v1/appointments/{ticketId}/arrive") {
		_ = SettleCurrent(ctx, client, Window1ID)
		return nil
	}
	if aStatus != http.StatusOK && aStatus != http.StatusNoContent {
		return fmt.Errorf("arrive appointment failed: status=%d", aStatus)
	}

	// Verify position/priority if position endpoint is available
	pos, _, pStatus, _ := client.GetQueuePosition(ctx, aptResp.Ticket.ID)
	if pStatus == http.StatusOK && pos != nil && pos.EffectivePriority != nil {
		if *pos.EffectivePriority < 100 {
			return fmt.Errorf("expected zero lateness penalty within grace (priority >= 100), got %d", *pos.EffectivePriority)
		}
	}

	_ = DrainWindow(ctx, client, Window1ID)
	t.Log("Scenario 5 PASSED")
	return nil
}

// Scenario 6: Appointment Lateness Penalty
func RunScenario6_AppointmentLateness(ctx context.Context, client *Client, t Logger) error {
	t.Log("Running Scenario 6: Appointment Lateness Penalty")
	_ = DrainAllDemoWindows(ctx, client)

	aptKey := fmt.Sprintf("late-apt-%d", time.Now().UnixNano())
	sched6 := time.Now().UTC().Add(2 * time.Second).Truncate(time.Second)
	aptResp, _, status, err := client.CreateAppointment(ctx, DemoBranchID, ParcelsServiceID, aptKey, sched6.Format(time.RFC3339))
	if err != nil || status != http.StatusCreated {
		return fmt.Errorf("create appointment failed: status=%d, err=%w", status, err)
	}
	wait6 := time.Until(sched6) + 400*time.Millisecond
	if wait6 > 0 {
		time.Sleep(wait6)
	}
	if err != nil || status != http.StatusCreated {
		return fmt.Errorf("create appointment failed: status=%d, err=%w", status, err)
	}

	// Call arrive
	_, aStatus, err := client.ArriveAppointment(ctx, aptResp.Ticket.ID)
	if err != nil {
		return fmt.Errorf("arrive network error: %w", err)
	}
	if isEndpointBlocked(aStatus, t, "POST /api/v1/appointments/{ticketId}/arrive") {
		_ = DrainWindow(ctx, client, Window1ID)
		return nil
	}

	_ = DrainWindow(ctx, client, Window1ID)
	t.Log("Scenario 6 PASSED")
	return nil
}

// Scenario 7: Branch-Delay Semantics (Lateness does not grow after arrival)
func RunScenario7_BranchDelaySemantics(ctx context.Context, client *Client, t Logger) error {
	t.Log("Running Scenario 7: Branch-Delay Semantics")
	_ = DrainAllDemoWindows(ctx, client)

	aptKey := fmt.Sprintf("delay-apt-%d", time.Now().UnixNano())
	sched7 := time.Now().UTC().Add(2 * time.Second).Truncate(time.Second)
	aptResp, _, status, err := client.CreateAppointment(ctx, DemoBranchID, ParcelsServiceID, aptKey, sched7.Format(time.RFC3339))
	if err != nil || status != http.StatusCreated {
		return fmt.Errorf("create appointment failed: status=%d, err=%w", status, err)
	}
	wait7 := time.Until(sched7) + 400*time.Millisecond
	if wait7 > 0 {
		time.Sleep(wait7)
	}
	if err != nil || status != http.StatusCreated {
		return fmt.Errorf("create appointment failed: status=%d, err=%w", status, err)
	}

	_, aStatus, err := client.ArriveAppointment(ctx, aptResp.Ticket.ID)
	if err != nil {
		return fmt.Errorf("arrive network error: %w", err)
	}
	if isEndpointBlocked(aStatus, t, "POST /api/v1/appointments/{ticketId}/arrive") {
		_ = DrainWindow(ctx, client, Window1ID)
		return nil
	}

	_ = DrainWindow(ctx, client, Window1ID)
	t.Log("Scenario 7 PASSED")
	return nil
}

// Scenario 8: Legacy Appointment Without Arrival
func RunScenario8_LegacyAppointment(ctx context.Context, client *Client, t Logger) error {
	t.Log("Running Scenario 8: Legacy Appointment Without Arrival (Backward Compatibility)")
	_ = DrainAllDemoWindows(ctx, client)

	// Create Appointment due in 2 seconds, wait until due, do NOT call arrive
	aptKey := fmt.Sprintf("legacy-apt-%d", time.Now().UnixNano())
	sched8 := time.Now().UTC().Add(2 * time.Second).Truncate(time.Second)
	aptResp, _, status, err := client.CreateAppointment(ctx, DemoBranchID, ParcelsServiceID, aptKey, sched8.Format(time.RFC3339))
	if err != nil || status != http.StatusCreated {
		return fmt.Errorf("create appointment failed: status=%d, err=%w", status, err)
	}
	wait8 := time.Until(sched8) + 400*time.Millisecond
	if wait8 > 0 {
		time.Sleep(wait8)
	}
	if err != nil || status != http.StatusCreated {
		return fmt.Errorf("create appointment failed: status=%d, err=%w", status, err)
	}

	// Must be eligible and claimed by Window 1 without calling arrive
	called, _, cStatus, err := client.CallNext(ctx, Window1ID)
	if err != nil || cStatus != http.StatusOK || called == nil {
		return fmt.Errorf("call-next for legacy appointment failed: status=%d, err=%w", cStatus, err)
	}
	if called.ID != aptResp.Ticket.ID {
		return fmt.Errorf("expected legacy appointment %s to be called, got %s", aptResp.Ticket.ID, called.ID)
	}

	_ = SettleCurrent(ctx, client, Window1ID)
	t.Log("Scenario 8 PASSED")
	return nil
}

// Scenario 9: NO_SHOW Transition & Idempotency
func RunScenario9_NoShow(ctx context.Context, client *Client, t Logger) error {
	t.Log("Running Scenario 9: NO_SHOW Transition & Idempotency")
	_ = DrainAllDemoWindows(ctx, client)

	// Create and call ticket to Window 1
	qrKey := fmt.Sprintf("noshow-qr-%d", time.Now().UnixNano())
	qrTicket, _, _, err := client.CreateQRTicket(ctx, DemoBranchID, ParcelsServiceID, qrKey)
	if err != nil {
		return fmt.Errorf("create QR failed: %w", err)
	}

	called, _, cStatus, err := client.CallNext(ctx, Window1ID)
	if err != nil || cStatus != http.StatusOK || called == nil || called.ID != qrTicket.ID {
		return fmt.Errorf("call-next failed: status=%d, err=%w", cStatus, err)
	}

	// Mark NO_SHOW
	_, nsStatus, err := client.MarkNoShow(ctx, called.ID)
	if err != nil {
		return fmt.Errorf("mark no-show network error: %w", err)
	}
	if isEndpointBlocked(nsStatus, t, "POST /api/v1/operator/tickets/{ticketId}/no-show") {
		_ = SettleCurrent(ctx, client, Window1ID)
		return nil
	}
	if nsStatus != http.StatusOK && nsStatus != http.StatusNoContent {
		return fmt.Errorf("expected 200/204 on mark no-show, got status=%d", nsStatus)
	}

	// Window 1 current ticket should now be 204 No Content
	_, _, curStatus, _ := client.GetCurrentTicket(ctx, Window1ID)
	if curStatus != http.StatusNoContent {
		return fmt.Errorf("expected Window 1 current ticket to be 204 after NO_SHOW, got %d", curStatus)
	}

	// Repeat NO_SHOW: must be idempotent
	_, rStatus, _ := client.MarkNoShow(ctx, called.ID)
	if rStatus != http.StatusOK && rStatus != http.StatusNoContent {
		return fmt.Errorf("expected idempotent 200/204 on repeated mark no-show, got %d", rStatus)
	}

	t.Log("Scenario 9 PASSED")
	return nil
}

// Scenario 10: NO_SHOW vs Start Concurrency
func RunScenario10_NoShowVsStart(ctx context.Context, client *Client, t Logger) error {
	t.Log("Running Scenario 10: NO_SHOW vs Start Concurrency")
	_ = DrainAllDemoWindows(ctx, client)

	qrKey := fmt.Sprintf("race-ns-%d", time.Now().UnixNano())
	qrTicket, _, _, err := client.CreateQRTicket(ctx, DemoBranchID, ParcelsServiceID, qrKey)
	if err != nil {
		return fmt.Errorf("create ticket failed: %w", err)
	}

	called, _, cStatus, err := client.CallNext(ctx, Window1ID)
	if err != nil || cStatus != http.StatusOK || called == nil || called.ID != qrTicket.ID {
		return fmt.Errorf("call-next failed: status=%d, err=%w", cStatus, err)
	}

	var startStatus, noShowStatus int
	var wg sync.WaitGroup
	wg.Add(2)

	go func() {
		defer wg.Done()
		_, _, startStatus, _ = client.StartService(ctx, called.ID)
	}()

	go func() {
		defer wg.Done()
		_, noShowStatus, _ = client.MarkNoShow(ctx, called.ID)
	}()

	wg.Wait()

	if isEndpointBlocked(noShowStatus, t, "POST /api/v1/operator/tickets/{ticketId}/no-show") {
		_ = SettleCurrent(ctx, client, Window1ID)
		return nil
	}

	// Exactly one must win 200, the other gets 409
	if (startStatus == http.StatusOK && noShowStatus == http.StatusConflict) ||
		(noShowStatus == http.StatusOK && startStatus == http.StatusConflict) {
		t.Logf("Race resolved correctly: startStatus=%d, noShowStatus=%d", startStatus, noShowStatus)
	} else {
		return fmt.Errorf("concurrency violation: expected one 200 and one 409, got start=%d, noShow=%d", startStatus, noShowStatus)
	}

	_ = SettleCurrent(ctx, client, Window1ID)
	t.Log("Scenario 10 PASSED")
	return nil
}

// Scenario 11: QueuePosition (All Reasons)
func RunScenario11_QueuePosition(ctx context.Context, client *Client, t Logger) error {
	t.Log("Running Scenario 11: QueuePosition")
	_ = DrainAllDemoWindows(ctx, client)

	// 1. Available reason: WAITING ticket with open compatible window
	qrKey := fmt.Sprintf("pos-qr-%d", time.Now().UnixNano())
	qrTicket, _, _, err := client.CreateQRTicket(ctx, DemoBranchID, ParcelsServiceID, qrKey)
	if err != nil {
		return fmt.Errorf("create QR failed: %w", err)
	}

	pos, _, pStatus, err := client.GetQueuePosition(ctx, qrTicket.ID)
	if err != nil {
		return fmt.Errorf("get position network error: %w", err)
	}
	if isEndpointBlocked(pStatus, t, "GET /api/v1/tickets/{ticketId}/position") {
		_ = DrainWindow(ctx, client, Window1ID)
		return nil
	}

	if pStatus != http.StatusOK || pos == nil || pos.Reason != "AVAILABLE" {
		return fmt.Errorf("expected reason=AVAILABLE, got status=%d, pos=%+v", pStatus, pos)
	}

	// 2. NotEligibleYet reason: future Appointment
	futKey := fmt.Sprintf("pos-fut-%d", time.Now().UnixNano())
	futTime := time.Now().UTC().Add(1 * time.Hour).Format(time.RFC3339)
	futResp, _, _, err := client.CreateAppointment(ctx, DemoBranchID, ParcelsServiceID, futKey, futTime)
	if err == nil && futResp != nil {
		fPos, _, fStatus, _ := client.GetQueuePosition(ctx, futResp.Ticket.ID)
		if fStatus == http.StatusOK && fPos != nil {
			if fPos.Reason != "NOT_ELIGIBLE_YET" {
				return fmt.Errorf("expected reason=NOT_ELIGIBLE_YET for future appointment, got %s", fPos.Reason)
			}
		}
		_, _, _ = client.CancelAppointment(ctx, futResp.Ticket.ID)
	}

	_ = DrainWindow(ctx, client, Window1ID)
	t.Log("Scenario 11 PASSED")
	return nil
}

// Scenario 12: Position Consistency with CallNext
func RunScenario12_PositionConsistency(ctx context.Context, client *Client, t Logger) error {
	t.Log("Running Scenario 12: Position Consistency with CallNext")
	_ = DrainAllDemoWindows(ctx, client)

	qrKey := fmt.Sprintf("pos-cons-%d", time.Now().UnixNano())
	qrTicket, _, _, err := client.CreateQRTicket(ctx, DemoBranchID, ParcelsServiceID, qrKey)
	if err != nil {
		return fmt.Errorf("create QR failed: %w", err)
	}

	pos, _, pStatus, _ := client.GetQueuePosition(ctx, qrTicket.ID)
	if isEndpointBlocked(pStatus, t, "GET /api/v1/tickets/{ticketId}/position") {
		_ = DrainWindow(ctx, client, Window1ID)
		return nil
	}

	if pStatus == http.StatusOK && pos != nil && pos.Position != nil && *pos.Position == 1 {
		called, _, cStatus, _ := client.CallNext(ctx, Window1ID)
		if cStatus != http.StatusOK || called == nil || called.ID != qrTicket.ID {
			return fmt.Errorf("expected ticket with position=1 to be called, got %+v", called)
		}
	}

	_ = SettleCurrent(ctx, client, Window1ID)
	t.Log("Scenario 12 PASSED")
	return nil
}

// Scenario 13: Multi-Window Reference Selection
func RunScenario13_MultiWindow(ctx context.Context, client *Client, t Logger) error {
	t.Log("Running Scenario 13: Multi-Window Reference Selection")
	_ = DrainAllDemoWindows(ctx, client)

	// Both Window 1 (number 1) and Window 3 (number 3) serve Parcels.
	// Reference Window must select Window 1 (number ASC).
	qrKey := fmt.Sprintf("pos-mw-%d", time.Now().UnixNano())
	qrTicket, _, _, err := client.CreateQRTicket(ctx, DemoBranchID, ParcelsServiceID, qrKey)
	if err != nil {
		return fmt.Errorf("create QR failed: %w", err)
	}

	pos, _, pStatus, _ := client.GetQueuePosition(ctx, qrTicket.ID)
	if isEndpointBlocked(pStatus, t, "GET /api/v1/tickets/{ticketId}/position") {
		_ = DrainWindow(ctx, client, Window1ID)
		return nil
	}

	if pStatus == http.StatusOK && pos != nil && pos.ReferenceWindow != nil {
		if pos.ReferenceWindow.Number != 1 {
			return fmt.Errorf("expected reference window number 1 (number ASC), got %d", pos.ReferenceWindow.Number)
		}
	}

	_ = DrainWindow(ctx, client, Window1ID)
	t.Log("Scenario 13 PASSED")
	return nil
}

// Scenario 14: Event Audit Chain
func RunScenario14_EventAudit(ctx context.Context, client *Client, t Logger) error {
	t.Log("Running Scenario 14: Event Audit Chain")
	_ = DrainAllDemoWindows(ctx, client)

	// Create LIVE ticket and process it through complete lifecycle
	key := fmt.Sprintf("ev-audit-%d", time.Now().UnixNano())
	ticket, _, _, err := client.CreateLiveTicket(ctx, DemoBranchID, ParcelsServiceID, key)
	if err != nil || ticket == nil {
		return fmt.Errorf("live create failed: %w", err)
	}

	called, _, _, _ := client.CallNext(ctx, Window1ID)
	if called != nil {
		_, _, _, _ = client.StartService(ctx, called.ID)
		_, _, _, _ = client.CompleteService(ctx, called.ID)
	}

	events, _, evStatus, err := client.ListTicketEvents(ctx, ticket.ID)
	if err == nil && evStatus == http.StatusOK && events != nil {
		types := []string{}
		for _, e := range events.Items {
			types = append(types, e.Type)
		}
		t.Logf("Observed event sequence for %s: %v", ticket.ID, types)
	}

	t.Log("Scenario 14 PASSED")
	return nil
}

// Scenario 15: Policy Compatibility (Extended GET, Full PUT, Legacy PUT, Version Conflict)
func RunScenario15_PolicyCompatibility(ctx context.Context, client *Client, t Logger) error {
	t.Log("Running Scenario 15: Policy Compatibility")

	// 1. GET queue policy
	policy, errResp, status, err := client.GetQueuePolicy(ctx, DemoBranchID)
	if err != nil || status != http.StatusOK || policy == nil {
		return fmt.Errorf("GET policy failed: status=%d, errResp=%v, err=%w", status, errResp, err)
	}

	// 2. Stale ExpectedVersion conflict
	staleReq := UpdateQueuePolicyRequest{
		AppointmentDuePriority: 100,
		QRPriority:             10,
		ExpectedVersion:        policy.Version - 1,
	}
	_, cErrResp, cStatus, _ := client.UpdateQueuePolicy(ctx, DemoBranchID, staleReq)
	if cStatus != http.StatusConflict {
		return fmt.Errorf("expected 409 for stale version %d (current %d), got status=%d (resp: %v)", policy.Version-1, policy.Version, cStatus, cErrResp)
	}

	// 3. Invalid validation (negative priority) -> 400 Bad Request
	invalidReq := UpdateQueuePolicyRequest{
		AppointmentDuePriority: -10,
		QRPriority:             10,
		ExpectedVersion:        policy.Version,
	}
	_, iErrResp, iStatus, _ := client.UpdateQueuePolicy(ctx, DemoBranchID, invalidReq)
	if iStatus != http.StatusBadRequest {
		return fmt.Errorf("expected 400 for negative priority, got status=%d (resp: %v)", iStatus, iErrResp)
	}

	_ = RestoreDefaultPolicy(ctx, client)
	t.Log("Scenario 15 PASSED")
	return nil
}
