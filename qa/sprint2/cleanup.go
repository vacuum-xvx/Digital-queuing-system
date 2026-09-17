package sprint2qa

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
				// Settle current ticket and retry
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

// RestoreDefaultPolicy ensures QueuePolicy for demo branch is set to appointmentDuePriority=100, qrPriority=10.
func RestoreDefaultPolicy(ctx context.Context, client *Client) error {
	policy, errResp, status, err := client.GetQueuePolicy(ctx, DemoBranchID)
	if err != nil {
		return fmt.Errorf("restoreDefaultPolicy: GET queue-policy failed: %w", err)
	}
	if status != http.StatusOK || policy == nil {
		return fmt.Errorf("restoreDefaultPolicy: GET queue-policy status %d (err: %v)", status, errResp)
	}

	if policy.AppointmentDuePriority == 100 && policy.QRPriority == 10 {
		return nil
	}

	req := UpdateQueuePolicyRequest{
		AppointmentDuePriority: 100,
		QRPriority:             10,
		ExpectedVersion:        policy.Version,
	}

	updPolicy, uErrResp, uStatus, uErr := client.UpdateQueuePolicy(ctx, DemoBranchID, req)
	if uErr != nil {
		return fmt.Errorf("restoreDefaultPolicy: PUT queue-policy failed: %w", uErr)
	}
	if uStatus != http.StatusOK || updPolicy == nil {
		return fmt.Errorf("restoreDefaultPolicy: PUT queue-policy returned status %d (err: %v)", uStatus, uErrResp)
	}

	return nil
}

// PreflightCleanEnvironment cleans all windows and ensures default policy.
func PreflightCleanEnvironment(ctx context.Context, client *Client) error {
	for _, wID := range []string{Window1ID, Window2ID, Window3ID} {
		if err := DrainWindow(ctx, client, wID); err != nil {
			return fmt.Errorf("preflightCleanEnvironment: drain window %s failed: %w", wID, err)
		}
	}
	if err := RestoreDefaultPolicy(ctx, client); err != nil {
		return fmt.Errorf("preflightCleanEnvironment: restore default policy failed: %w", err)
	}
	return nil
}

// CancelIfScheduled safely cancels an appointment ticket if it is currently SCHEDULED.
func CancelIfScheduled(ctx context.Context, client *Client, ticketID string) {
	if ticketID == "" {
		return
	}
	t, _, status, err := client.GetTicket(ctx, ticketID)
	if err == nil && status == http.StatusOK && t != nil && t.Status == "SCHEDULED" {
		_, _, _, _ = client.CancelAppointment(ctx, ticketID)
	}
}
