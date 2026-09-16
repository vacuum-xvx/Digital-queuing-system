package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"postcode/backend/internal/application"
	"postcode/backend/internal/domain"
)

type FakeUseCases struct {
	ListBranchesFunc       func(ctx context.Context) ([]domain.Branch, error)
	ListBranchServicesFunc func(ctx context.Context, branchID string) ([]domain.Service, error)
	ListBranchWindowsFunc  func(ctx context.Context, branchID string) ([]domain.Window, error)
	CreateQRTicketFunc     func(ctx context.Context, cmd application.CreateQRTicketCommand) (application.CreateQRTicketResult, error)
	CreateAppointmentFunc  func(ctx context.Context, cmd application.CreateAppointmentCommand) (application.CreateQRTicketResult, error)
	CreateLiveTicketFunc   func(ctx context.Context, cmd application.CreateLiveTicketCommand) (domain.Ticket, error)
	CancelTicketFunc       func(ctx context.Context, ticketID string) (domain.Ticket, error)
	ReturnTicketFunc       func(ctx context.Context, ticketID, windowID string) (domain.Ticket, error)
	RedirectTicketFunc     func(ctx context.Context, ticketID, windowID, targetServiceID string) (domain.Ticket, error)
	GetTicketFunc          func(ctx context.Context, ticketID string) (domain.Ticket, error)
	GetCurrentTicketFunc   func(ctx context.Context, windowID string) (*domain.Ticket, error)
	CallNextFunc           func(ctx context.Context, windowID string) (domain.Ticket, error)
	StartServiceFunc       func(ctx context.Context, ticketID string) (domain.Ticket, error)
	CompleteServiceFunc    func(ctx context.Context, ticketID string) (domain.Ticket, error)
}

var _ application.UseCases = (*FakeUseCases)(nil)

func (f *FakeUseCases) ListBranches(ctx context.Context) ([]domain.Branch, error) {
	return f.ListBranchesFunc(ctx)
}

func (f *FakeUseCases) ListBranchServices(ctx context.Context, branchID string) ([]domain.Service, error) {
	return f.ListBranchServicesFunc(ctx, branchID)
}

func (f *FakeUseCases) ListBranchWindows(ctx context.Context, branchID string) ([]domain.Window, error) {
	return f.ListBranchWindowsFunc(ctx, branchID)
}

func (f *FakeUseCases) CreateQRTicket(ctx context.Context, cmd application.CreateQRTicketCommand) (application.CreateQRTicketResult, error) {
	return f.CreateQRTicketFunc(ctx, cmd)
}

func (f *FakeUseCases) CreateAppointment(ctx context.Context, cmd application.CreateAppointmentCommand) (application.CreateQRTicketResult, error) {
	if f.CreateAppointmentFunc != nil {
		return f.CreateAppointmentFunc(ctx, cmd)
	}
	return application.CreateQRTicketResult{}, nil
}

func (f *FakeUseCases) CreateLiveTicket(ctx context.Context, cmd application.CreateLiveTicketCommand) (domain.Ticket, error) {
	if f.CreateLiveTicketFunc != nil {
		return f.CreateLiveTicketFunc(ctx, cmd)
	}
	return domain.Ticket{}, nil
}

func (f *FakeUseCases) CancelTicket(ctx context.Context, ticketID string) (domain.Ticket, error) {
	if f.CancelTicketFunc != nil {
		return f.CancelTicketFunc(ctx, ticketID)
	}
	return domain.Ticket{}, nil
}

func (f *FakeUseCases) ReturnTicket(ctx context.Context, ticketID, windowID string) (domain.Ticket, error) {
	if f.ReturnTicketFunc != nil {
		return f.ReturnTicketFunc(ctx, ticketID, windowID)
	}
	return domain.Ticket{}, nil
}

func (f *FakeUseCases) RedirectTicket(ctx context.Context, ticketID, windowID, targetServiceID string) (domain.Ticket, error) {
	if f.RedirectTicketFunc != nil {
		return f.RedirectTicketFunc(ctx, ticketID, windowID, targetServiceID)
	}
	return domain.Ticket{}, nil
}

func (f *FakeUseCases) GetTicket(ctx context.Context, ticketID string) (domain.Ticket, error) {
	return f.GetTicketFunc(ctx, ticketID)
}

func (f *FakeUseCases) GetCurrentTicket(ctx context.Context, windowID string) (*domain.Ticket, error) {
	return f.GetCurrentTicketFunc(ctx, windowID)
}

func (f *FakeUseCases) CallNext(ctx context.Context, windowID string) (domain.Ticket, error) {
	return f.CallNextFunc(ctx, windowID)
}

func (f *FakeUseCases) StartService(ctx context.Context, ticketID string) (domain.Ticket, error) {
	return f.StartServiceFunc(ctx, ticketID)
}

func (f *FakeUseCases) CompleteService(ctx context.Context, ticketID string) (domain.Ticket, error) {
	return f.CompleteServiceFunc(ctx, ticketID)
}

func setupTest(usecases *FakeUseCases) http.Handler {
	db := &fakeDB{}
	logger := slog.New(slog.NewJSONHandler(bytes.NewBuffer(nil), nil))
	return NewRouter(db, usecases, logger, "*")
}

func TestListBranches(t *testing.T) {
	uc := &FakeUseCases{
		ListBranchesFunc: func(ctx context.Context) ([]domain.Branch, error) {
			return []domain.Branch{{ID: "b1", Name: "Branch 1"}}, nil
		},
	}
	r := setupTest(uc)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/branches", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	expected := `{"items":[{"id":"b1","name":"Branch 1"}]}`
	if strings := string(rec.Body.Bytes()); strings[:len(expected)] != expected {
		t.Errorf("expected %s in body", expected)
	}
}

func TestCreateQRTicket(t *testing.T) {
	called := 0
	uc := &FakeUseCases{
		CreateQRTicketFunc: func(ctx context.Context, cmd application.CreateQRTicketCommand) (application.CreateQRTicketResult, error) {
			called++
			if cmd.IdempotencyKey == "conflict" {
				return application.CreateQRTicketResult{}, application.ErrIdempotencyConflict
			}
			return application.CreateQRTicketResult{
				Ticket:   domain.Ticket{ID: "t1", Status: domain.TicketStatusWaiting},
				Replayed: cmd.IdempotencyKey == "replay",
			}, nil
		},
	}
	r := setupTest(uc)

	t.Run("success 201", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/branches/b1/tickets/qr", bytes.NewBufferString(`{"serviceId":"s1"}`))
		req.Header.Set("Idempotency-Key", "new-key")
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusCreated {
			t.Errorf("expected 201, got %d", rec.Code)
		}
	})

	t.Run("replay 200", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/branches/b1/tickets/qr", bytes.NewBufferString(`{"serviceId":"s1"}`))
		req.Header.Set("Idempotency-Key", "replay")
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Errorf("expected 200, got %d", rec.Code)
		}
	})

	t.Run("missing idempotency key", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/branches/b1/tickets/qr", bytes.NewBufferString(`{"serviceId":"s1"}`))
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Errorf("expected 400, got %d", rec.Code)
		}
		var errResp ErrorResponse
		json.Unmarshal(rec.Body.Bytes(), &errResp)
		if errResp.Error.Code != "VALIDATION_ERROR" {
			t.Errorf("expected VALIDATION_ERROR, got %s", errResp.Error.Code)
		}
	})

	t.Run("conflict", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/branches/b1/tickets/qr", bytes.NewBufferString(`{"serviceId":"s1"}`))
		req.Header.Set("Idempotency-Key", "conflict")
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusConflict {
			t.Errorf("expected 409, got %d", rec.Code)
		}
		var errResp ErrorResponse
		json.Unmarshal(rec.Body.Bytes(), &errResp)
		if errResp.Error.Code != "IDEMPOTENCY_CONFLICT" {
			t.Errorf("expected IDEMPOTENCY_CONFLICT, got %s", errResp.Error.Code)
		}
	})
}

func TestErrors(t *testing.T) {
	uc := &FakeUseCases{
		GetCurrentTicketFunc: func(ctx context.Context, windowID string) (*domain.Ticket, error) {
			if windowID == "notfound" {
				return nil, application.ErrNotFound
			}
			return nil, nil
		},
		CallNextFunc: func(ctx context.Context, windowID string) (domain.Ticket, error) {
			if windowID == "busy" {
				return domain.Ticket{}, application.ErrWindowBusy
			}
			return domain.Ticket{}, application.ErrNoEligibleTickets
		},
	}
	r := setupTest(uc)

	t.Run("not found", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/operator/windows/notfound/current-ticket", nil)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		if rec.Code != http.StatusNotFound {
			t.Errorf("expected 404, got %d", rec.Code)
		}
	})

	t.Run("no content", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/operator/windows/empty/current-ticket", nil)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		if rec.Code != http.StatusNoContent {
			t.Errorf("expected 204, got %d", rec.Code)
		}
	})

	t.Run("window busy", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/operator/windows/busy/call-next", nil)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		if rec.Code != http.StatusConflict {
			t.Errorf("expected 409, got %d", rec.Code)
		}
		var resp ErrorResponse
		json.Unmarshal(rec.Body.Bytes(), &resp)
		if resp.Error.Code != "WINDOW_BUSY" {
			t.Errorf("expected WINDOW_BUSY, got %s", resp.Error.Code)
		}
	})
	
	t.Run("no eligible tickets", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/operator/windows/empty/call-next", nil)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		if rec.Code != http.StatusConflict {
			t.Errorf("expected 409, got %d", rec.Code)
		}
		var resp ErrorResponse
		json.Unmarshal(rec.Body.Bytes(), &resp)
		if resp.Error.Code != "NO_ELIGIBLE_TICKETS" {
			t.Errorf("expected NO_ELIGIBLE_TICKETS, got %s", resp.Error.Code)
		}
		if resp.Error.RequestID == "" {
			t.Errorf("expected request ID to be present")
		}
	})
}

func TestCreateAppointment(t *testing.T) {
	uc := &FakeUseCases{
		CreateAppointmentFunc: func(ctx context.Context, cmd application.CreateAppointmentCommand) (application.CreateQRTicketResult, error) {
			if cmd.IdempotencyKey == "conflict" {
				return application.CreateQRTicketResult{}, application.ErrIdempotencyConflict
			}
			if cmd.BranchID == "b-notfound" {
				return application.CreateQRTicketResult{}, application.ErrNotFound
			}
			return application.CreateQRTicketResult{
				Ticket: domain.Ticket{
					ID:        "t-appt",
					BranchID:  cmd.BranchID,
					ServiceID: cmd.ServiceID,
					Source:    domain.TicketSourceAppointment,
					Status:    domain.TicketStatusWaiting,
				},
				Replayed: cmd.IdempotencyKey == "replay",
			}, nil
		},
	}
	r := setupTest(uc)

	t.Run("success 201", func(t *testing.T) {
		body := `{"serviceId":"s1","scheduledTime":"2026-09-17T10:00:00Z"}`
		req := httptest.NewRequest(http.MethodPost, "/api/v1/branches/b1/tickets/appointment", bytes.NewBufferString(body))
		req.Header.Set("Idempotency-Key", "new-key")
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusCreated {
			t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
		}
		var ticket TicketDTO
		if err := json.Unmarshal(rec.Body.Bytes(), &ticket); err != nil {
			t.Fatalf("failed to decode response: %v", err)
		}
		if ticket.ID != "t-appt" || ticket.Source != string(domain.TicketSourceAppointment) {
			t.Errorf("unexpected ticket payload: %+v", ticket)
		}
	})

	t.Run("replay 200", func(t *testing.T) {
		body := `{"serviceId":"s1","scheduledTime":"2026-09-17T10:00:00Z"}`
		req := httptest.NewRequest(http.MethodPost, "/api/v1/branches/b1/tickets/appointment", bytes.NewBufferString(body))
		req.Header.Set("Idempotency-Key", "replay")
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", rec.Code)
		}
	})

	t.Run("missing idempotency key 400", func(t *testing.T) {
		body := `{"serviceId":"s1","scheduledTime":"2026-09-17T10:00:00Z"}`
		req := httptest.NewRequest(http.MethodPost, "/api/v1/branches/b1/tickets/appointment", bytes.NewBufferString(body))
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", rec.Code)
		}
		var errResp ErrorResponse
		json.Unmarshal(rec.Body.Bytes(), &errResp)
		if errResp.Error.Code != "VALIDATION_ERROR" || errResp.Error.Message != "Missing Idempotency-Key header" {
			t.Errorf("unexpected error: %+v", errResp)
		}
	})

	t.Run("missing serviceId 400", func(t *testing.T) {
		body := `{"scheduledTime":"2026-09-17T10:00:00Z"}`
		req := httptest.NewRequest(http.MethodPost, "/api/v1/branches/b1/tickets/appointment", bytes.NewBufferString(body))
		req.Header.Set("Idempotency-Key", "key")
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", rec.Code)
		}
		var errResp ErrorResponse
		json.Unmarshal(rec.Body.Bytes(), &errResp)
		if errResp.Error.Code != "VALIDATION_ERROR" || errResp.Error.Message != "Invalid request body" {
			t.Errorf("unexpected error: %+v", errResp)
		}
	})

	t.Run("invalid json 400", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/branches/b1/tickets/appointment", bytes.NewBufferString(`invalid`))
		req.Header.Set("Idempotency-Key", "key")
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", rec.Code)
		}
		var errResp ErrorResponse
		json.Unmarshal(rec.Body.Bytes(), &errResp)
		if errResp.Error.Code != "VALIDATION_ERROR" || errResp.Error.Message != "Invalid request body" {
			t.Errorf("unexpected error: %+v", errResp)
		}
	})

	t.Run("missing scheduledTime 400", func(t *testing.T) {
		body := `{"serviceId":"s1"}`
		req := httptest.NewRequest(http.MethodPost, "/api/v1/branches/b1/tickets/appointment", bytes.NewBufferString(body))
		req.Header.Set("Idempotency-Key", "key")
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", rec.Code)
		}
		var errResp ErrorResponse
		json.Unmarshal(rec.Body.Bytes(), &errResp)
		if errResp.Error.Code != "VALIDATION_ERROR" || errResp.Error.Message != "Invalid scheduledTime format (expected RFC3339)" {
			t.Errorf("unexpected error: %+v", errResp)
		}
	})

	t.Run("invalid scheduledTime format 400", func(t *testing.T) {
		body := `{"serviceId":"s1","scheduledTime":"not-a-date"}`
		req := httptest.NewRequest(http.MethodPost, "/api/v1/branches/b1/tickets/appointment", bytes.NewBufferString(body))
		req.Header.Set("Idempotency-Key", "key")
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", rec.Code)
		}
		var errResp ErrorResponse
		json.Unmarshal(rec.Body.Bytes(), &errResp)
		if errResp.Error.Code != "VALIDATION_ERROR" || errResp.Error.Message != "Invalid scheduledTime format (expected RFC3339)" {
			t.Errorf("unexpected error: %+v", errResp)
		}
	})

	t.Run("conflict 409", func(t *testing.T) {
		body := `{"serviceId":"s1","scheduledTime":"2026-09-17T10:00:00Z"}`
		req := httptest.NewRequest(http.MethodPost, "/api/v1/branches/b1/tickets/appointment", bytes.NewBufferString(body))
		req.Header.Set("Idempotency-Key", "conflict")
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusConflict {
			t.Fatalf("expected 409, got %d", rec.Code)
		}
		var errResp ErrorResponse
		json.Unmarshal(rec.Body.Bytes(), &errResp)
		if errResp.Error.Code != "IDEMPOTENCY_CONFLICT" {
			t.Errorf("expected IDEMPOTENCY_CONFLICT, got %s", errResp.Error.Code)
		}
	})

	t.Run("not found 404", func(t *testing.T) {
		body := `{"serviceId":"s1","scheduledTime":"2026-09-17T10:00:00Z"}`
		req := httptest.NewRequest(http.MethodPost, "/api/v1/branches/b-notfound/tickets/appointment", bytes.NewBufferString(body))
		req.Header.Set("Idempotency-Key", "key")
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusNotFound {
			t.Fatalf("expected 404, got %d", rec.Code)
		}
		var errResp ErrorResponse
		json.Unmarshal(rec.Body.Bytes(), &errResp)
		if errResp.Error.Code != "NOT_FOUND" {
			t.Errorf("expected NOT_FOUND, got %s", errResp.Error.Code)
		}
	})
}

func TestCancelTicket(t *testing.T) {
	uc := &FakeUseCases{
		CancelTicketFunc: func(ctx context.Context, ticketID string) (domain.Ticket, error) {
			if ticketID == "notfound" {
				return domain.Ticket{}, application.ErrNotFound
			}
			if ticketID == "invalid-state" {
				return domain.Ticket{}, application.ErrInvalidState
			}
			return domain.Ticket{
				ID:     ticketID,
				Status: domain.TicketStatusCancelled,
			}, nil
		},
	}
	r := setupTest(uc)

	t.Run("success 200", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/tickets/t1/cancel", nil)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", rec.Code)
		}
		var ticket TicketDTO
		json.Unmarshal(rec.Body.Bytes(), &ticket)
		if ticket.ID != "t1" || ticket.Status != string(domain.TicketStatusCancelled) {
			t.Errorf("unexpected ticket: %+v", ticket)
		}
	})

	t.Run("not found 404", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/tickets/notfound/cancel", nil)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusNotFound {
			t.Fatalf("expected 404, got %d", rec.Code)
		}
		var resp ErrorResponse
		json.Unmarshal(rec.Body.Bytes(), &resp)
		if resp.Error.Code != "NOT_FOUND" {
			t.Errorf("expected NOT_FOUND, got %s", resp.Error.Code)
		}
	})

	t.Run("invalid state 409", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/tickets/invalid-state/cancel", nil)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusConflict {
			t.Fatalf("expected 409, got %d", rec.Code)
		}
		var resp ErrorResponse
		json.Unmarshal(rec.Body.Bytes(), &resp)
		if resp.Error.Code != "INVALID_TICKET_STATE" {
			t.Errorf("expected INVALID_TICKET_STATE, got %s", resp.Error.Code)
		}
	})
}

func TestCreateLiveTicket(t *testing.T) {
	uc := &FakeUseCases{
		CreateLiveTicketFunc: func(ctx context.Context, cmd application.CreateLiveTicketCommand) (domain.Ticket, error) {
			if cmd.WindowID == "busy" {
				return domain.Ticket{}, application.ErrWindowBusy
			}
			if cmd.WindowID == "notfound" {
				return domain.Ticket{}, application.ErrNotFound
			}
			return domain.Ticket{
				ID:        "t-live",
				BranchID:  cmd.BranchID,
				ServiceID: cmd.ServiceID,
				Source:    domain.TicketSourceLive,
				Status:    domain.TicketStatusCalled,
			}, nil
		},
	}
	r := setupTest(uc)

	t.Run("success 201", func(t *testing.T) {
		body := `{"branchId":"b1","serviceId":"s1"}`
		req := httptest.NewRequest(http.MethodPost, "/api/v1/operator/windows/w1/tickets/live", bytes.NewBufferString(body))
		req.Header.Set("Idempotency-Key", "live-key")
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusCreated {
			t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
		}
		var ticket TicketDTO
		json.Unmarshal(rec.Body.Bytes(), &ticket)
		if ticket.ID != "t-live" || ticket.Source != string(domain.TicketSourceLive) {
			t.Errorf("unexpected ticket: %+v", ticket)
		}
	})

	t.Run("missing idempotency key 400", func(t *testing.T) {
		body := `{"branchId":"b1","serviceId":"s1"}`
		req := httptest.NewRequest(http.MethodPost, "/api/v1/operator/windows/w1/tickets/live", bytes.NewBufferString(body))
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", rec.Code)
		}
		var resp ErrorResponse
		json.Unmarshal(rec.Body.Bytes(), &resp)
		if resp.Error.Code != "VALIDATION_ERROR" || resp.Error.Message != "Missing Idempotency-Key header" {
			t.Errorf("unexpected error: %+v", resp)
		}
	})

	t.Run("missing serviceId 400", func(t *testing.T) {
		body := `{"branchId":"b1"}`
		req := httptest.NewRequest(http.MethodPost, "/api/v1/operator/windows/w1/tickets/live", bytes.NewBufferString(body))
		req.Header.Set("Idempotency-Key", "key")
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", rec.Code)
		}
		var resp ErrorResponse
		json.Unmarshal(rec.Body.Bytes(), &resp)
		if resp.Error.Code != "VALIDATION_ERROR" || resp.Error.Message != "Invalid request body" {
			t.Errorf("unexpected error: %+v", resp)
		}
	})

	t.Run("invalid json 400", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/operator/windows/w1/tickets/live", bytes.NewBufferString(`{bad`))
		req.Header.Set("Idempotency-Key", "key")
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", rec.Code)
		}
		var resp ErrorResponse
		json.Unmarshal(rec.Body.Bytes(), &resp)
		if resp.Error.Code != "VALIDATION_ERROR" {
			t.Errorf("unexpected error: %+v", resp)
		}
	})

	t.Run("window busy 409", func(t *testing.T) {
		body := `{"branchId":"b1","serviceId":"s1"}`
		req := httptest.NewRequest(http.MethodPost, "/api/v1/operator/windows/busy/tickets/live", bytes.NewBufferString(body))
		req.Header.Set("Idempotency-Key", "key")
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusConflict {
			t.Fatalf("expected 409, got %d", rec.Code)
		}
		var resp ErrorResponse
		json.Unmarshal(rec.Body.Bytes(), &resp)
		if resp.Error.Code != "WINDOW_BUSY" {
			t.Errorf("expected WINDOW_BUSY, got %s", resp.Error.Code)
		}
	})

	t.Run("not found 404", func(t *testing.T) {
		body := `{"branchId":"b1","serviceId":"s1"}`
		req := httptest.NewRequest(http.MethodPost, "/api/v1/operator/windows/notfound/tickets/live", bytes.NewBufferString(body))
		req.Header.Set("Idempotency-Key", "key")
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusNotFound {
			t.Fatalf("expected 404, got %d", rec.Code)
		}
		var resp ErrorResponse
		json.Unmarshal(rec.Body.Bytes(), &resp)
		if resp.Error.Code != "NOT_FOUND" {
			t.Errorf("expected NOT_FOUND, got %s", resp.Error.Code)
		}
	})
}

func TestReturnTicket(t *testing.T) {
	uc := &FakeUseCases{
		ReturnTicketFunc: func(ctx context.Context, ticketID, windowID string) (domain.Ticket, error) {
			if ticketID == "notfound" {
				return domain.Ticket{}, application.ErrNotFound
			}
			if ticketID == "invalid-state" {
				return domain.Ticket{}, application.ErrInvalidState
			}
			return domain.Ticket{
				ID:     ticketID,
				Status: domain.TicketStatusWaiting,
			}, nil
		},
	}
	r := setupTest(uc)

	t.Run("success 200", func(t *testing.T) {
		body := `{"windowId":"w1"}`
		req := httptest.NewRequest(http.MethodPost, "/api/v1/operator/tickets/t1/return", bytes.NewBufferString(body))
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", rec.Code)
		}
		var ticket TicketDTO
		json.Unmarshal(rec.Body.Bytes(), &ticket)
		if ticket.ID != "t1" || ticket.Status != string(domain.TicketStatusWaiting) {
			t.Errorf("unexpected ticket: %+v", ticket)
		}
	})

	t.Run("missing windowId 400", func(t *testing.T) {
		body := `{}`
		req := httptest.NewRequest(http.MethodPost, "/api/v1/operator/tickets/t1/return", bytes.NewBufferString(body))
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", rec.Code)
		}
		var resp ErrorResponse
		json.Unmarshal(rec.Body.Bytes(), &resp)
		if resp.Error.Code != "VALIDATION_ERROR" || resp.Error.Message != "Missing windowId" {
			t.Errorf("unexpected error: %+v", resp)
		}
	})

	t.Run("invalid body 400", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/operator/tickets/t1/return", bytes.NewBufferString(`bad`))
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", rec.Code)
		}
		var resp ErrorResponse
		json.Unmarshal(rec.Body.Bytes(), &resp)
		if resp.Error.Code != "VALIDATION_ERROR" || resp.Error.Message != "Missing windowId" {
			t.Errorf("unexpected error: %+v", resp)
		}
	})

	t.Run("not found 404", func(t *testing.T) {
		body := `{"windowId":"w1"}`
		req := httptest.NewRequest(http.MethodPost, "/api/v1/operator/tickets/notfound/return", bytes.NewBufferString(body))
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusNotFound {
			t.Fatalf("expected 404, got %d", rec.Code)
		}
		var resp ErrorResponse
		json.Unmarshal(rec.Body.Bytes(), &resp)
		if resp.Error.Code != "NOT_FOUND" {
			t.Errorf("expected NOT_FOUND, got %s", resp.Error.Code)
		}
	})

	t.Run("invalid state 409", func(t *testing.T) {
		body := `{"windowId":"w1"}`
		req := httptest.NewRequest(http.MethodPost, "/api/v1/operator/tickets/invalid-state/return", bytes.NewBufferString(body))
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusConflict {
			t.Fatalf("expected 409, got %d", rec.Code)
		}
		var resp ErrorResponse
		json.Unmarshal(rec.Body.Bytes(), &resp)
		if resp.Error.Code != "INVALID_TICKET_STATE" {
			t.Errorf("expected INVALID_TICKET_STATE, got %s", resp.Error.Code)
		}
	})
}

func TestRedirectTicket(t *testing.T) {
	uc := &FakeUseCases{
		RedirectTicketFunc: func(ctx context.Context, ticketID, windowID, targetServiceID string) (domain.Ticket, error) {
			if ticketID == "notfound" {
				return domain.Ticket{}, application.ErrNotFound
			}
			if ticketID == "invalid-state" {
				return domain.Ticket{}, application.ErrInvalidState
			}
			return domain.Ticket{
				ID:        ticketID,
				ServiceID: targetServiceID,
				Status:    domain.TicketStatusWaiting,
			}, nil
		},
	}
	r := setupTest(uc)

	t.Run("success 200", func(t *testing.T) {
		body := `{"windowId":"w1","targetServiceId":"s2"}`
		req := httptest.NewRequest(http.MethodPost, "/api/v1/operator/tickets/t1/redirect", bytes.NewBufferString(body))
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", rec.Code)
		}
		var ticket TicketDTO
		json.Unmarshal(rec.Body.Bytes(), &ticket)
		if ticket.ID != "t1" || ticket.ServiceID != "s2" || ticket.Status != string(domain.TicketStatusWaiting) {
			t.Errorf("unexpected ticket: %+v", ticket)
		}
	})

	t.Run("missing windowId 400", func(t *testing.T) {
		body := `{"targetServiceId":"s2"}`
		req := httptest.NewRequest(http.MethodPost, "/api/v1/operator/tickets/t1/redirect", bytes.NewBufferString(body))
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", rec.Code)
		}
		var resp ErrorResponse
		json.Unmarshal(rec.Body.Bytes(), &resp)
		if resp.Error.Code != "VALIDATION_ERROR" || resp.Error.Message != "Missing windowId or targetServiceId" {
			t.Errorf("unexpected error: %+v", resp)
		}
	})

	t.Run("missing targetServiceId 400", func(t *testing.T) {
		body := `{"windowId":"w1"}`
		req := httptest.NewRequest(http.MethodPost, "/api/v1/operator/tickets/t1/redirect", bytes.NewBufferString(body))
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", rec.Code)
		}
		var resp ErrorResponse
		json.Unmarshal(rec.Body.Bytes(), &resp)
		if resp.Error.Code != "VALIDATION_ERROR" || resp.Error.Message != "Missing windowId or targetServiceId" {
			t.Errorf("unexpected error: %+v", resp)
		}
	})

	t.Run("invalid body 400", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/operator/tickets/t1/redirect", bytes.NewBufferString(`bad`))
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", rec.Code)
		}
		var resp ErrorResponse
		json.Unmarshal(rec.Body.Bytes(), &resp)
		if resp.Error.Code != "VALIDATION_ERROR" || resp.Error.Message != "Missing windowId or targetServiceId" {
			t.Errorf("unexpected error: %+v", resp)
		}
	})

	t.Run("not found 404", func(t *testing.T) {
		body := `{"windowId":"w1","targetServiceId":"s2"}`
		req := httptest.NewRequest(http.MethodPost, "/api/v1/operator/tickets/notfound/redirect", bytes.NewBufferString(body))
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusNotFound {
			t.Fatalf("expected 404, got %d", rec.Code)
		}
		var resp ErrorResponse
		json.Unmarshal(rec.Body.Bytes(), &resp)
		if resp.Error.Code != "NOT_FOUND" {
			t.Errorf("expected NOT_FOUND, got %s", resp.Error.Code)
		}
	})

	t.Run("invalid state 409", func(t *testing.T) {
		body := `{"windowId":"w1","targetServiceId":"s2"}`
		req := httptest.NewRequest(http.MethodPost, "/api/v1/operator/tickets/invalid-state/redirect", bytes.NewBufferString(body))
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusConflict {
			t.Fatalf("expected 409, got %d", rec.Code)
		}
		var resp ErrorResponse
		json.Unmarshal(rec.Body.Bytes(), &resp)
		if resp.Error.Code != "INVALID_TICKET_STATE" {
			t.Errorf("expected INVALID_TICKET_STATE, got %s", resp.Error.Code)
		}
	})
}

