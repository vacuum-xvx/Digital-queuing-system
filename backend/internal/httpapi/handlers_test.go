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
	GetTicketFunc          func(ctx context.Context, ticketID string) (domain.Ticket, error)
	GetCurrentTicketFunc   func(ctx context.Context, windowID string) (*domain.Ticket, error)
	CallNextFunc           func(ctx context.Context, windowID string) (domain.Ticket, error)
	StartServiceFunc       func(ctx context.Context, ticketID string) (domain.Ticket, error)
	CompleteServiceFunc    func(ctx context.Context, ticketID string) (domain.Ticket, error)
	
	CreateLiveTicketFunc   func(ctx context.Context, cmd application.CreateLiveTicketCommand) (domain.Ticket, error)
	CreateAppointmentFunc  func(ctx context.Context, cmd application.CreateAppointmentCommand) (domain.Ticket, error)
	ChangeWindowStatusFunc func(ctx context.Context, windowID string, status domain.WindowStatus) (domain.Window, error)
	ReturnTicketFunc       func(ctx context.Context, ticketID string) (domain.Ticket, error)
	RedirectTicketFunc     func(ctx context.Context, cmd application.RedirectTicketCommand) (domain.Ticket, error)
}

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

func (f *FakeUseCases) CreateLiveTicket(ctx context.Context, cmd application.CreateLiveTicketCommand) (domain.Ticket, error) {
	return f.CreateLiveTicketFunc(ctx, cmd)
}

func (f *FakeUseCases) CreateAppointment(ctx context.Context, cmd application.CreateAppointmentCommand) (domain.Ticket, error) {
	return f.CreateAppointmentFunc(ctx, cmd)
}

func (f *FakeUseCases) ChangeWindowStatus(ctx context.Context, windowID string, status domain.WindowStatus) (domain.Window, error) {
	return f.ChangeWindowStatusFunc(ctx, windowID, status)
}

func (f *FakeUseCases) ReturnTicket(ctx context.Context, ticketID string) (domain.Ticket, error) {
	return f.ReturnTicketFunc(ctx, ticketID)
}

func (f *FakeUseCases) RedirectTicket(ctx context.Context, cmd application.RedirectTicketCommand) (domain.Ticket, error) {
	return f.RedirectTicketFunc(ctx, cmd)
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
