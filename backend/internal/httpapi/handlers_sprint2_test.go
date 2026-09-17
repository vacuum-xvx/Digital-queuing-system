package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"postcode/backend/internal/application"
	"postcode/backend/internal/domain"
)

func TestCreateAppointment_Sprint2(t *testing.T) {
	schedTime := time.Now().Add(1 * time.Hour).Truncate(time.Second)
	uc := &FakeUseCases{
		CreateAppointmentFunc: func(ctx context.Context, cmd application.CreateAppointmentCommand) (application.CreateAppointmentResult, error) {
			if cmd.IdempotencyKey == "conflict" {
				return application.CreateAppointmentResult{}, application.ErrIdempotencyConflict
			}
			return application.CreateAppointmentResult{
				Appointment: application.AppointmentView{
					Ticket: domain.Ticket{
						ID:             "t-app-1",
						PublicNumber:   "A-000001",
						BranchID:       cmd.BranchID,
						ServiceID:      cmd.ServiceID,
						Source:         domain.TicketSourceAppointment,
						Status:         domain.TicketStatusScheduled,
						CreatedAt:      schedTime.Add(-10 * time.Minute),
						QueueEnteredAt: schedTime,
						ScheduledAt:    &schedTime,
					},
					ScheduledAt: schedTime,
				},
				Replayed: cmd.IdempotencyKey == "replay",
			}, nil
		},
	}
	r := setupTest(uc)

	t.Run("success 201", func(t *testing.T) {
		body := `{"branchId":"b1","serviceId":"s1","scheduledAt":"` + schedTime.Format(time.RFC3339) + `"}`
		req := httptest.NewRequest(http.MethodPost, "/api/v1/appointments", bytes.NewBufferString(body))
		req.Header.Set("Idempotency-Key", "k1")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusCreated {
			t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
		}
		var res AppointmentResponse
		if err := json.NewDecoder(w.Body).Decode(&res); err != nil {
			t.Fatal(err)
		}
		if res.Ticket.ID != "t-app-1" || res.Ticket.Status != "SCHEDULED" || res.Ticket.PublicNumber != "A-000001" {
			t.Fatalf("unexpected ticket: %+v", res.Ticket)
		}
	})

	t.Run("replay 200", func(t *testing.T) {
		body := `{"branchId":"b1","serviceId":"s1","scheduledAt":"` + schedTime.Format(time.RFC3339) + `"}`
		req := httptest.NewRequest(http.MethodPost, "/api/v1/appointments", bytes.NewBufferString(body))
		req.Header.Set("Idempotency-Key", "replay")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
		}
	})

	t.Run("invalid scheduledAt", func(t *testing.T) {
		body := `{"branchId":"b1","serviceId":"s1","scheduledAt":"not-a-date"}`
		req := httptest.NewRequest(http.MethodPost, "/api/v1/appointments", bytes.NewBufferString(body))
		req.Header.Set("Idempotency-Key", "k1")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d: %s", w.Code, w.Body.String())
		}
	})

	t.Run("missing key", func(t *testing.T) {
		body := `{"branchId":"b1","serviceId":"s1","scheduledAt":"` + schedTime.Format(time.RFC3339) + `"}`
		req := httptest.NewRequest(http.MethodPost, "/api/v1/appointments", bytes.NewBufferString(body))
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", w.Code)
		}
	})

	t.Run("appointment conflict", func(t *testing.T) {
		body := `{"branchId":"b1","serviceId":"s1","scheduledAt":"` + schedTime.Format(time.RFC3339) + `"}`
		req := httptest.NewRequest(http.MethodPost, "/api/v1/appointments", bytes.NewBufferString(body))
		req.Header.Set("Idempotency-Key", "conflict")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusConflict {
			t.Fatalf("expected 409, got %d", w.Code)
		}
	})
}

func TestCancelAppointment_Sprint2(t *testing.T) {
	schedTime := time.Now().Add(1 * time.Hour).Truncate(time.Second)
	uc := &FakeUseCases{
		CancelAppointmentFunc: func(ctx context.Context, ticketID string) (application.AppointmentView, error) {
			if ticketID == "notfound" {
				return application.AppointmentView{}, application.ErrNotFound
			}
			if ticketID == "invalid" {
				return application.AppointmentView{}, application.ErrInvalidState
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
	}
	r := setupTest(uc)

	t.Run("cancel 200", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/appointments/t-app-1/cancel", nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", w.Code)
		}
		var res AppointmentResponse
		if err := json.NewDecoder(w.Body).Decode(&res); err != nil {
			t.Fatal(err)
		}
		if res.Ticket.Status != "CANCELLED" {
			t.Fatalf("expected CANCELLED, got %s", res.Ticket.Status)
		}
	})

	t.Run("invalid cancel state", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/appointments/invalid/cancel", nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusConflict {
			t.Fatalf("expected 409, got %d", w.Code)
		}
	})

	t.Run("cancel not found", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/appointments/notfound/cancel", nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusNotFound {
			t.Fatalf("expected 404, got %d", w.Code)
		}
	})
}

func TestQueuePolicy_Sprint2(t *testing.T) {
	now := time.Now().UTC()
	uc := &FakeUseCases{
		GetQueuePolicyFunc: func(ctx context.Context, branchID string) (domain.QueuePolicy, error) {
			if branchID == "notfound" {
				return domain.QueuePolicy{}, application.ErrNotFound
			}
			return domain.QueuePolicy{
				BranchID:               branchID,
				AppointmentDuePriority: 100,
				QRPriority:             10,
				Version:                1,
				UpdatedAt:              now,
			}, nil
		},
		UpdateQueuePolicyFunc: func(ctx context.Context, cmd application.UpdateQueuePolicyCommand) (domain.QueuePolicy, error) {
			if cmd.ExpectedVersion == 999 {
				return domain.QueuePolicy{}, application.ErrPolicyVersionConflict
			}
			return domain.QueuePolicy{
				BranchID:               cmd.BranchID,
				AppointmentDuePriority: cmd.AppointmentDuePriority,
				QRPriority:             cmd.QRPriority,
				Version:                cmd.ExpectedVersion + 1,
				UpdatedAt:              now,
			}, nil
		},
	}
	r := setupTest(uc)

	t.Run("GET policy", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/branches/b1/queue-policy", nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", w.Code)
		}
		var p QueuePolicyDTO
		if err := json.NewDecoder(w.Body).Decode(&p); err != nil {
			t.Fatal(err)
		}
		if p.AppointmentDuePriority != 100 || p.QRPriority != 10 || p.Version != 1 {
			t.Fatalf("unexpected policy: %+v", p)
		}
	})

	t.Run("PUT policy", func(t *testing.T) {
		body := `{"appointmentDuePriority":200,"qrPriority":20,"expectedVersion":1}`
		req := httptest.NewRequest(http.MethodPut, "/api/v1/admin/branches/b1/queue-policy", bytes.NewBufferString(body))
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
		}
		var p QueuePolicyDTO
		if err := json.NewDecoder(w.Body).Decode(&p); err != nil {
			t.Fatal(err)
		}
		if p.Version != 2 {
			t.Fatalf("expected version 2, got %d", p.Version)
		}
	})

	t.Run("version conflict", func(t *testing.T) {
		body := `{"appointmentDuePriority":200,"qrPriority":20,"expectedVersion":999}`
		req := httptest.NewRequest(http.MethodPut, "/api/v1/admin/branches/b1/queue-policy", bytes.NewBufferString(body))
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusConflict {
			t.Fatalf("expected 409, got %d: %s", w.Code, w.Body.String())
		}
	})

	t.Run("policy validation", func(t *testing.T) {
		body := `{"appointmentDuePriority":10,"qrPriority":100,"expectedVersion":1}`
		req := httptest.NewRequest(http.MethodPut, "/api/v1/admin/branches/b1/queue-policy", bytes.NewBufferString(body))
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", w.Code)
		}
	})
}

func TestTicketEvents_Sprint2(t *testing.T) {
	now := time.Now().UTC()
	v1 := int64(1)
	p100 := 100
	fromSched := domain.TicketStatusScheduled
	uc := &FakeUseCases{
		ListTicketEventsFunc: func(ctx context.Context, ticketID string) ([]domain.TicketEvent, error) {
			if ticketID == "notfound" {
				return nil, application.ErrNotFound
			}
			return []domain.TicketEvent{
				{
					ID:         1,
					TicketID:   ticketID,
					Type:       domain.TicketEventCreated,
					ToStatus:   domain.TicketStatusScheduled,
					OccurredAt: now,
				},
				{
					ID:               2,
					TicketID:         ticketID,
					Type:             domain.TicketEventCalled,
					FromStatus:       &fromSched,
					ToStatus:         domain.TicketStatusCalled,
					PolicyVersion:    &v1,
					DecisionPriority: &p100,
					OccurredAt:       now.Add(1 * time.Minute),
				},
			}, nil
		},
	}
	r := setupTest(uc)

	t.Run("event list DTO", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/tickets/t1/events", nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
		}
		var res ListTicketEventsResponse
		if err := json.NewDecoder(w.Body).Decode(&res); err != nil {
			t.Fatal(err)
		}
		if len(res.Items) != 2 {
			t.Fatalf("expected 2 events, got %d", len(res.Items))
		}
		if res.Items[1].PolicyVersion == nil || *res.Items[1].PolicyVersion != 1 {
			t.Fatalf("expected policyVersion 1, got %v", res.Items[1].PolicyVersion)
		}
	})

	t.Run("event not found", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/tickets/notfound/events", nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusNotFound {
			t.Fatalf("expected 404, got %d", w.Code)
		}
	})
}
