package sprint1qa

import (
	"context"
	"fmt"
	"net/http"
)

// SettleCurrent transitions any active CALLED or SERVING ticket in the given window to COMPLETED.
// Endpoints used:
// GET  /operator/windows/{windowId}/current-ticket
// POST /operator/tickets/{ticketId}/start
// POST /operator/tickets/{ticketId}/complete
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
		sTicket, sErrResp, sStatus, sErr := client.StartService(ctx, ticket.ID)
		if sErr != nil || sStatus != http.StatusOK {
			return fmt.Errorf("settleCurrent: failed to start ticket %s in window %s (status=%d, errResp=%v): %w", ticket.ID, windowID, sStatus, sErrResp, sErr)
		}
		_ = sTicket
		cTicket, cErrResp, cStatus, cErr := client.CompleteService(ctx, ticket.ID)
		if cErr != nil || cStatus != http.StatusOK {
			return fmt.Errorf("settleCurrent: failed to complete ticket %s in window %s (status=%d, errResp=%v): %w", ticket.ID, windowID, cStatus, cErrResp, cErr)
		}
		_ = cTicket
		return nil

	case "SERVING":
		cTicket, cErrResp, cStatus, cErr := client.CompleteService(ctx, ticket.ID)
		if cErr != nil || cStatus != http.StatusOK {
			return fmt.Errorf("settleCurrent: failed to complete serving ticket %s in window %s (status=%d, errResp=%v): %w", ticket.ID, windowID, cStatus, cErrResp, cErr)
		}
		_ = cTicket
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

// PreflightCleanEnvironment ensures all demo windows and queues are drained and clean before a scenario runs.
// Order mandated by Sprint #1 QA Contract:
// 1. settleCurrent(Window 1)
// 2. settleCurrent(Window 2)
// 3. settleCurrent(Window 3)
// 4. drainWindow(Window 1) — drains PARCELS queue
// 5. drainWindow(Window 2) — drains PAYMENTS queue
// 6. drainWindow(Window 3) — confirms no remaining PARCELS
func PreflightCleanEnvironment(ctx context.Context, client *Client) error {
	if err := SettleCurrent(ctx, client, Window1ID); err != nil {
		return fmt.Errorf("preflight: settle Window 1 failed: %w", err)
	}
	if err := SettleCurrent(ctx, client, Window2ID); err != nil {
		return fmt.Errorf("preflight: settle Window 2 failed: %w", err)
	}
	if err := SettleCurrent(ctx, client, Window3ID); err != nil {
		return fmt.Errorf("preflight: settle Window 3 failed: %w", err)
	}

	if err := DrainWindow(ctx, client, Window1ID); err != nil {
		return fmt.Errorf("preflight: drain Window 1 failed: %w", err)
	}
	if err := DrainWindow(ctx, client, Window2ID); err != nil {
		return fmt.Errorf("preflight: drain Window 2 failed: %w", err)
	}
	if err := DrainWindow(ctx, client, Window3ID); err != nil {
		return fmt.Errorf("preflight: drain Window 3 failed: %w", err)
	}

	return nil
}

// EnsureTicketCompleted best-effort transitions a created ticket to COMPLETED state.
func EnsureTicketCompleted(ctx context.Context, client *Client, ticketID string, compatibleWindowIDs ...string) error {
	if ticketID == "" {
		return nil
	}

	ticket, _, status, err := client.GetTicket(ctx, ticketID)
	if err != nil || status != http.StatusOK || ticket == nil {
		// If cannot fetch ticket, try settling windows
		for _, wid := range compatibleWindowIDs {
			_ = SettleCurrent(ctx, client, wid)
		}
		return nil
	}

	if ticket.Status == "COMPLETED" {
		return nil
	}

	if ticket.Status == "CALLED" || ticket.Status == "SERVING" {
		if ticket.Window != nil {
			return SettleCurrent(ctx, client, ticket.Window.ID)
		}
		for _, wid := range compatibleWindowIDs {
			_ = SettleCurrent(ctx, client, wid)
		}
		return nil
	}

	if ticket.Status == "WAITING" {
		for _, wid := range compatibleWindowIDs {
			// Settle and drain until ticket is completed or queue is empty
			_ = SettleCurrent(ctx, client, wid)
			for attempt := 0; attempt < 50; attempt++ {
				cur, _, _, _ := client.GetTicket(ctx, ticketID)
				if cur != nil && cur.Status == "COMPLETED" {
					return nil
				}
				called, _, cStatus, _ := client.CallNext(ctx, wid)
				if cStatus == http.StatusOK && called != nil {
					_, _, _, _ = client.StartService(ctx, called.ID)
					_, _, _, _ = client.CompleteService(ctx, called.ID)
					if called.ID == ticketID {
						return nil
					}
				} else {
					break
				}
			}
		}
	}

	return nil
}
