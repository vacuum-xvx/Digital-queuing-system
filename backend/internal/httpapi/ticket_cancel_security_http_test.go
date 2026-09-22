package httpapi

import (
	"bytes"
	"context"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"postcode/backend/internal/application"
	"postcode/backend/internal/domain"
	"postcode/backend/internal/persistence"
)

func setupPublicTest(usecases *FakeUseCases) http.Handler {
	db := &fakeDB{}
	logger := slog.New(slog.NewJSONHandler(bytes.NewBuffer(nil), nil))
	return NewRouter(db, usecases, logger, "http://localhost:3000")
}

func TestPublicCancelSecurityEndpoints(t *testing.T) {
	schedTime := time.Now().Add(1 * time.Hour).Truncate(time.Second)
	uc := &FakeUseCases{
		CancelAppointmentFunc: func(ctx context.Context, ticketID string) (application.AppointmentView, error) {
			token, hasToken := persistence.ManagementTokenFromContext(ctx)
			if persistence.IsStaffBypass(ctx) {
				// Staff allowed
			} else if !hasToken || token != "valid-secret-token" {
				return application.AppointmentView{}, application.ErrForbidden
			}
			return application.AppointmentView{
				Ticket: domain.Ticket{
					ID:           ticketID,
					PublicNumber: "A-000001",
					Source:       domain.TicketSourceAppointment,
					Status:       domain.TicketStatusCancelled,
					ScheduledAt:  &schedTime,
				},
				ScheduledAt: schedTime,
			}, nil
		},
		CancelTicketFunc: func(ctx context.Context, ticketID string) (domain.Ticket, error) {
			token, hasToken := persistence.ManagementTokenFromContext(ctx)
			if persistence.IsStaffBypass(ctx) {
				// Staff allowed
			} else if !hasToken || token != "valid-secret-token" {
				return domain.Ticket{}, application.ErrForbidden
			}
			return domain.Ticket{
				ID:           ticketID,
				PublicNumber: "Q-001",
				Source:       domain.TicketSourceQR,
				Status:       domain.TicketStatusCancelled,
			}, nil
		},
	}

	rPublic := setupPublicTest(uc)

	t.Run("CancelAppointment without token returns 403", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/appointments/t-app-1/cancel", nil)
		w := httptest.NewRecorder()
		rPublic.ServeHTTP(w, req)

		if w.Code != http.StatusForbidden {
			t.Fatalf("expected 403 Forbidden without token, got %d: %s", w.Code, w.Body.String())
		}
	})

	t.Run("CancelAppointment with wrong token returns 403", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/appointments/t-app-1/cancel", nil)
		req.Header.Set("X-Ticket-Manage-Token", "wrong-secret")
		w := httptest.NewRecorder()
		rPublic.ServeHTTP(w, req)

		if w.Code != http.StatusForbidden {
			t.Fatalf("expected 403 Forbidden with wrong token, got %d: %s", w.Code, w.Body.String())
		}
	})

	t.Run("CancelAppointment with valid token returns 200", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/appointments/t-app-1/cancel", nil)
		req.Header.Set("X-Ticket-Manage-Token", "valid-secret-token")
		w := httptest.NewRecorder()
		rPublic.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200 OK with valid token, got %d: %s", w.Code, w.Body.String())
		}
	})

	t.Run("CancelTicket without token returns 403", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/tickets/t-qr-1/cancel", nil)
		w := httptest.NewRecorder()
		rPublic.ServeHTTP(w, req)

		if w.Code != http.StatusForbidden {
			t.Fatalf("expected 403 Forbidden without token, got %d: %s", w.Code, w.Body.String())
		}
	})

	t.Run("CancelTicket with wrong token returns 403", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/tickets/t-qr-1/cancel", nil)
		req.Header.Set("X-Ticket-Manage-Token", "wrong-secret")
		w := httptest.NewRecorder()
		rPublic.ServeHTTP(w, req)

		if w.Code != http.StatusForbidden {
			t.Fatalf("expected 403 Forbidden with wrong token, got %d: %s", w.Code, w.Body.String())
		}
	})

	t.Run("CancelTicket with valid token returns 200", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/tickets/t-qr-1/cancel", nil)
		req.Header.Set("X-Ticket-Manage-Token", "valid-secret-token")
		w := httptest.NewRecorder()
		rPublic.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200 OK with valid token, got %d: %s", w.Code, w.Body.String())
		}
	})

	// Staff caller (via cookie session) does NOT require token
	rStaff := setupTest(uc) // setupTest injects operator/admin cookie session
	t.Run("Staff cancels appointment without token returns 200", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/appointments/t-app-1/cancel", nil)
		w := httptest.NewRecorder()
		rStaff.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200 OK for staff bypass, got %d: %s", w.Code, w.Body.String())
		}
	})

	t.Run("Staff cancels ticket without token returns 200", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/tickets/t-qr-1/cancel", nil)
		w := httptest.NewRecorder()
		rStaff.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200 OK for staff bypass, got %d: %s", w.Code, w.Body.String())
		}
	})
}
