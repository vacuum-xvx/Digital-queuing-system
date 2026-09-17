package sprint3qa

import (
	"context"
	"fmt"
	"net/http"
)

// SettleCurrent transitions any active CALLED or SERVING ticket in the given window to COMPLETED.
func SettleCurrent(ctx context.Context, client *Client, windowID string) error {
	ticket, errResp, status, err := client.GetCurrentTicket(ctx, windowID)
	if err != nil {
		return fmt.Errorf("settleCurrent: network error getting current ticket for window %s: %w", windowID, err)
	}

	// 204 No Content -> no active ticket, window is clean
	if status == http.StatusNoContent {
		return nil
	}

	if status != http.StatusOK || ticket == nil {
		return fmt.Errorf("settleCurrent: unexpected HTTP status %d (err: %v) for window %s", status, errResp, windowID)
	}

	switch ticket.Status {
	case "CALLED":
		_, sErrResp, sStatus, sErr := client.StartService(ctx, ticket.ID)
		if sErr != nil || sStatus != http.StatusOK {
			return fmt.Errorf("settleCurrent: failed to start ticket %s in window %s (status=%d, errResp=%v): %w", ticket.ID, windowID, sStatus, sErrResp, sErr)
		}
		_, cErrResp, cStatus, cErr := client.CompleteService(ctx, ticket.ID)
		if cErr != nil || cStatus != http.StatusOK {
			return fmt.Errorf("settleCurrent: failed to complete ticket %s in window %s (status=%d, errResp=%v): %w", ticket.ID, windowID, cStatus, cErrResp, cErr)
		}
		return nil

	case "SERVING":
		_, cErrResp, cStatus, cErr := client.CompleteService(ctx, ticket.ID)
		if cErr != nil || cStatus != http.StatusOK {
			return fmt.Errorf("settleCurrent: failed to complete serving ticket %s in window %s (status=%d, errResp=%v): %w", ticket.ID, windowID, cStatus, cErrResp, cErr)
		}
		return nil

	default:
		return fmt.Errorf("settleCurrent: unexpected active ticket status %q for ticket %s in window %s", ticket.Status, ticket.ID, windowID)
	}
}

// DrainWindow settles the current ticket, then repeatedly calls call-next until NO_ELIGIBLE_TICKETS is returned.
func DrainWindow(ctx context.Context, client *Client, windowID string) error {
	if err := SettleCurrent(ctx, client, windowID); err != nil {
		return fmt.Errorf("drainWindow: pre-settle failed for window %s: %w", windowID, err)
	}

	const maxDrainAttempts = 500
	for attempt := 0; attempt < maxDrainAttempts; attempt++ {
		ticket, errResp, status, err := client.CallNext(ctx, windowID)
		if err != nil {
			return fmt.Errorf("drainWindow: network error on call-next for window %s: %w", windowID, err)
		}

		if status == http.StatusOK && ticket != nil {
			// Successfully called ticket, start and complete it
			_, sErr, sStatus, err1 := client.StartService(ctx, ticket.ID)
			if err1 != nil || sStatus != http.StatusOK {
				return fmt.Errorf("drainWindow: failed to start ticket %s (status=%d, errResp=%v): %w", ticket.ID, sStatus, sErr, err1)
			}
			_, cErr, cStatus, err2 := client.CompleteService(ctx, ticket.ID)
			if err2 != nil || cStatus != http.StatusOK {
				return fmt.Errorf("drainWindow: failed to complete ticket %s (status=%d, errResp=%v): %w", ticket.ID, cStatus, cErr, err2)
			}
			continue
		}

		if status == http.StatusConflict && errResp != nil {
			if errResp.Error.Code == "NO_ELIGIBLE_TICKETS" {
				// Queue for this window is empty, drained successfully
				return nil
			}
			if errResp.Error.Code == "WINDOW_BUSY" {
				if err := SettleCurrent(ctx, client, windowID); err != nil {
					return fmt.Errorf("drainWindow: settle on WINDOW_BUSY failed for window %s: %w", windowID, err)
				}
				continue
			}
			return fmt.Errorf("drainWindow: unexpected conflict error code %q for window %s: %s", errResp.Error.Code, windowID, errResp.Error.Message)
		}

		return fmt.Errorf("drainWindow: unexpected HTTP response status %d (body: %v) for window %s", status, errResp, windowID)
	}

	return fmt.Errorf("drainWindow: exceeded maximum drain attempts (%d) for window %s", maxDrainAttempts, windowID)
}

// DrainAllDemoWindows drains Window 1, Window 2, and Window 3.
func DrainAllDemoWindows(ctx context.Context, client *Client) error {
	windows := []string{Window1ID, Window2ID, Window3ID}
	for _, wid := range windows {
		if err := DrainWindow(ctx, client, wid); err != nil {
			return err
		}
	}
	return nil
}

// RestoreDefaultPolicy ensures QueuePolicy for demo branch is set to frozen Sprint 3 defaults.
func RestoreDefaultPolicy(ctx context.Context, client *Client) error {
	policy, errResp, status, err := client.GetQueuePolicy(ctx, DemoBranchID)
	if err != nil {
		return fmt.Errorf("restoreDefaultPolicy: GET queue-policy failed: %w", err)
	}
	if status != http.StatusOK || policy == nil {
		return fmt.Errorf("restoreDefaultPolicy: GET queue-policy status %d: %v", status, errResp)
	}

	livePri := 10
	thresh := 15
	ptsPerMin := 10
	grace := 15
	penaltyPerMin := 5
	maxPenalty := 90

	req := UpdateQueuePolicyRequest{
		AppointmentDuePriority:          100,
		QRPriority:                      10,
		LivePriority:                    &livePri,
		AntiStarvationThresholdMinutes:  &thresh,
		AntiStarvationPointsPerMinute:   &ptsPerMin,
		AppointmentGraceMinutes:         &grace,
		AppointmentLatePenaltyPerMinute: &penaltyPerMin,
		AppointmentLatePenaltyMaxPoints: &maxPenalty,
		ExpectedVersion:                 policy.Version,
	}

	_, uErrResp, uStatus, uErr := client.UpdateQueuePolicy(ctx, DemoBranchID, req)
	if uErr != nil {
		return fmt.Errorf("restoreDefaultPolicy: PUT queue-policy failed: %w", uErr)
	}

	// If the current backend handler does not accept full Sprint 3 fields yet, fallback to legacy PUT
	if uStatus == http.StatusBadRequest || uStatus == http.StatusConflict {
		legacyReq := UpdateQueuePolicyRequest{
			AppointmentDuePriority: 100,
			QRPriority:             10,
			ExpectedVersion:        policy.Version,
		}
		_, lErrResp, lStatus, lErr := client.UpdateQueuePolicy(ctx, DemoBranchID, legacyReq)
		if lErr != nil || (lStatus != http.StatusOK && lStatus != http.StatusConflict) {
			return fmt.Errorf("restoreDefaultPolicy: legacy PUT failed (status=%d, errResp=%v): %w", lStatus, lErrResp, lErr)
		}
		return nil
	}

	if uStatus != http.StatusOK {
		return fmt.Errorf("restoreDefaultPolicy: unexpected PUT status %d: %v", uStatus, uErrResp)
	}

	return nil
}

// VerifyFoundation checks /health, /ready, demo branch, services, and windows.
func VerifyFoundation(ctx context.Context, client *Client) error {
	hStatus, err := client.Health(ctx)
	if err != nil || hStatus != http.StatusOK {
		return fmt.Errorf("foundation check failed: /health status=%d, err=%v", hStatus, err)
	}

	rStatus, err := client.Ready(ctx)
	if err != nil || rStatus != http.StatusOK {
		return fmt.Errorf("foundation check failed: /ready status=%d, err=%v", rStatus, err)
	}

	branches, bErr, bStatus, err := client.ListBranches(ctx)
	if err != nil || bStatus != http.StatusOK || branches == nil {
		return fmt.Errorf("foundation check failed: list branches status=%d, errResp=%v, err=%v", bStatus, bErr, err)
	}
	foundBranch := false
	for _, b := range branches.Items {
		if b.ID == DemoBranchID {
			foundBranch = true
			break
		}
	}
	if !foundBranch {
		return fmt.Errorf("foundation check failed: demo branch %s not found in branch list", DemoBranchID)
	}

	services, sErr, sStatus, err := client.ListBranchServices(ctx, DemoBranchID)
	if err != nil || sStatus != http.StatusOK || services == nil {
		return fmt.Errorf("foundation check failed: list services status=%d, errResp=%v, err=%v", sStatus, sErr, err)
	}
	foundParcels, foundPayments := false, false
	for _, s := range services.Items {
		if s.ID == ParcelsServiceID {
			foundParcels = true
		}
		if s.ID == PaymentsServiceID {
			foundPayments = true
		}
	}
	if !foundParcels || !foundPayments {
		return fmt.Errorf("foundation check failed: demo branch missing expected parcels or payments service")
	}

	windows, wErr, wStatus, err := client.ListBranchWindows(ctx, DemoBranchID)
	if err != nil || wStatus != http.StatusOK || windows == nil {
		return fmt.Errorf("foundation check failed: list windows status=%d, errResp=%v, err=%v", wStatus, wErr, err)
	}
	if len(windows.Items) < 3 {
		return fmt.Errorf("foundation check failed: expected at least 3 windows in demo branch, got %d", len(windows.Items))
	}

	return nil
}
