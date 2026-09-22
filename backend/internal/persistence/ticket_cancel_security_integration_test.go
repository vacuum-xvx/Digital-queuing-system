package persistence

import (
	"errors"
	"testing"
	"time"

	"postcode/backend/internal/application"
	"postcode/backend/internal/domain"
)

func TestTicketCancellationSecurity(t *testing.T) {
	ctx, p, _ := integration(t)

	// 1. Appointment cancellation security
	t.Run("AppointmentCancellationSecurity", func(t *testing.T) {
		slot := time.Now().UTC().Add(45 * time.Minute).Truncate(time.Minute)
		res, err := p.CreateAppointment(ctx, application.CreateAppointmentCommand{
			BranchID:       demoBranch,
			ServiceID:      parcels,
			IdempotencyKey: "cancel-sec-apt-1",
			ScheduledAt:    slot,
		})
		if err != nil {
			t.Fatalf("create appointment: %v", err)
		}
		rawToken := res.Appointment.Ticket.ManagementToken
		if rawToken == nil || *rawToken == "" {
			t.Fatalf("expected non-empty management token on appointment creation")
		}

		aptID := res.Appointment.Ticket.ID

		// A. Cancel without token (public client) -> ErrForbidden
		publicCtx := WithPublicClient(ctx)
		_, err = p.CancelAppointment(publicCtx, aptID)
		if !errors.Is(err, application.ErrForbidden) {
			t.Fatalf("expected ErrForbidden when cancelling without token, got: %v", err)
		}

		// B. Cancel with wrong token -> ErrForbidden
		wrongCtx := WithManagementToken(ctx, "invalid-token-12345")
		_, err = p.CancelAppointment(wrongCtx, aptID)
		if !errors.Is(err, application.ErrForbidden) {
			t.Fatalf("expected ErrForbidden when cancelling with wrong token, got: %v", err)
		}

		// C. Cancel with correct token -> Success
		correctCtx := WithManagementToken(ctx, *rawToken)
		cancelled, err := p.CancelAppointment(correctCtx, aptID)
		if err != nil {
			t.Fatalf("expected success with correct token, got: %v", err)
		}
		if cancelled.Ticket.Status != domain.TicketStatusCancelled {
			t.Fatalf("expected status CANCELLED, got: %v", cancelled.Ticket.Status)
		}

		// D. Staff bypass can cancel without token
		slot2 := time.Now().UTC().Add(50 * time.Minute).Truncate(time.Minute)
		res2, err := p.CreateAppointment(ctx, application.CreateAppointmentCommand{
			BranchID:       demoBranch,
			ServiceID:      parcels,
			IdempotencyKey: "cancel-sec-apt-2",
			ScheduledAt:    slot2,
		})
		if err != nil {
			t.Fatalf("create appointment 2: %v", err)
		}
		staffCtx := WithStaffBypass(ctx)
		cancelledStaff, err := p.CancelAppointment(staffCtx, res2.Appointment.Ticket.ID)
		if err != nil {
			t.Fatalf("expected staff bypass to succeed without token, got: %v", err)
		}
		if cancelledStaff.Ticket.Status != domain.TicketStatusCancelled {
			t.Fatalf("expected status CANCELLED from staff bypass, got: %v", cancelledStaff.Ticket.Status)
		}
	})

	// 2. QR Ticket cancellation security
	t.Run("QRTicketCancellationSecurity", func(t *testing.T) {
		qrResult, err := p.CreateQRTicket(ctx, application.CreateQRTicketCommand{
			BranchID:       demoBranch,
			ServiceID:      parcels,
			IdempotencyKey: "cancel-sec-qr-1",
		})
		if err != nil {
			t.Fatalf("create QR ticket: %v", err)
		}
		rawToken := qrResult.Ticket.ManagementToken
		if rawToken == nil || *rawToken == "" {
			t.Fatalf("expected non-empty management token on QR ticket creation")
		}

		ticketID := qrResult.Ticket.ID

		// A. Cancel without token (public client) -> ErrForbidden
		publicCtx := WithPublicClient(ctx)
		_, err = p.CancelTicket(publicCtx, ticketID)
		if !errors.Is(err, application.ErrForbidden) {
			t.Fatalf("expected ErrForbidden when cancelling QR ticket without token, got: %v", err)
		}

		// B. Cancel with wrong token -> ErrForbidden
		wrongCtx := WithManagementToken(ctx, "wrong-management-token")
		_, err = p.CancelTicket(wrongCtx, ticketID)
		if !errors.Is(err, application.ErrForbidden) {
			t.Fatalf("expected ErrForbidden when cancelling QR ticket with wrong token, got: %v", err)
		}

		// C. Cancel with correct token -> Success
		correctCtx := WithManagementToken(ctx, *rawToken)
		cancelled, err := p.CancelTicket(correctCtx, ticketID)
		if err != nil {
			t.Fatalf("expected success with correct token, got: %v", err)
		}
		if cancelled.Status != domain.TicketStatusCancelled {
			t.Fatalf("expected status CANCELLED, got: %v", cancelled.Status)
		}

		// D. Staff bypass can cancel QR ticket without token
		qrResult2, err := p.CreateQRTicket(ctx, application.CreateQRTicketCommand{
			BranchID:       demoBranch,
			ServiceID:      parcels,
			IdempotencyKey: "cancel-sec-qr-2",
		})
		if err != nil {
			t.Fatalf("create QR ticket 2: %v", err)
		}
		staffCtx := WithStaffBypass(ctx)
		cancelledStaff, err := p.CancelTicket(staffCtx, qrResult2.Ticket.ID)
		if err != nil {
			t.Fatalf("expected staff bypass to succeed without token, got: %v", err)
		}
		if cancelledStaff.Status != domain.TicketStatusCancelled {
			t.Fatalf("expected status CANCELLED from staff bypass, got: %v", cancelledStaff.Status)
		}
	})
}
