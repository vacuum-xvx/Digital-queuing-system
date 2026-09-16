package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"postcode/backend/internal/application"
	"postcode/backend/internal/domain"
)

type API struct {
	usecases application.UseCases
}

func NewAPI(usecases application.UseCases) *API {
	return &API{usecases: usecases}
}

func (a *API) RegisterRoutes(r chi.Router) {
	r.Route("/api/v1", func(r chi.Router) {
		r.Get("/branches", a.ListBranches)
		r.Get("/branches/{branchId}/services", a.ListBranchServices)
		r.Post("/branches/{branchId}/tickets/qr", a.CreateQRTicket)
		r.Get("/tickets/{ticketId}", a.GetTicket)

		r.Route("/operator", func(r chi.Router) {
			r.Get("/branches/{branchId}/windows", a.ListBranchWindows)
			r.Get("/windows/{windowId}/current-ticket", a.GetCurrentTicket)
			r.Post("/windows/{windowId}/call-next", a.CallNext)
			r.Post("/tickets/{ticketId}/start", a.StartService)
			r.Post("/tickets/{ticketId}/complete", a.CompleteService)
		})
	})
}

// -----------------------------------------------------------------------------
// Responses DTOs
// -----------------------------------------------------------------------------

type ListBranchesResponse struct {
	Items []BranchDTO `json:"items"`
}

type BranchDTO struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type ListServicesResponse struct {
	Items []ServiceDTO `json:"items"`
}

type ServiceDTO struct {
	ID   string `json:"id"`
	Code string `json:"code"`
	Name string `json:"name"`
}

type WindowRefDTO struct {
	ID     string `json:"id"`
	Number int    `json:"number"`
}

type TicketDTO struct {
	ID               string        `json:"id"`
	PublicNumber     string        `json:"publicNumber"`
	BranchID         string        `json:"branchId"`
	ServiceID        string        `json:"serviceId"`
	Source           string        `json:"source"`
	Status           string        `json:"status"`
	Window           *WindowRefDTO `json:"window"`
	CreatedAt        time.Time     `json:"createdAt"`
	QueueEnteredAt   time.Time     `json:"queueEnteredAt"`
	CalledAt         *time.Time    `json:"calledAt"`
	ServiceStartedAt *time.Time    `json:"serviceStartedAt"`
	CompletedAt      *time.Time    `json:"completedAt"`
}

type WindowDTO struct {
	ID       string       `json:"id"`
	Number   int          `json:"number"`
	Status   string       `json:"status"`
	Services []ServiceDTO `json:"services"`
}

type ErrorResponse struct {
	Error ErrorDetail `json:"error"`
}

type ErrorDetail struct {
	Code      string `json:"code"`
	Message   string `json:"message"`
	RequestID string `json:"requestId"`
}

// -----------------------------------------------------------------------------
// Mapping Helpers
// -----------------------------------------------------------------------------

func mapTicket(t domain.Ticket) TicketDTO {
	var window *WindowRefDTO
	if t.Window != nil {
		window = &WindowRefDTO{
			ID:     t.Window.ID,
			Number: t.Window.Number,
		}
	}
	return TicketDTO{
		ID:               t.ID,
		PublicNumber:     t.PublicNumber,
		BranchID:         t.BranchID,
		ServiceID:        t.ServiceID,
		Source:           string(t.Source),
		Status:           string(t.Status),
		Window:           window,
		CreatedAt:        t.CreatedAt,
		QueueEnteredAt:   t.QueueEnteredAt,
		CalledAt:         t.CalledAt,
		ServiceStartedAt: t.ServiceStartedAt,
		CompletedAt:      t.CompletedAt,
	}
}

func (a *API) respondError(w http.ResponseWriter, r *http.Request, err error) {
	var code string
	var status int

	switch {
	case errors.Is(err, application.ErrNotFound):
		status = http.StatusNotFound
		code = "NOT_FOUND"
	case errors.Is(err, application.ErrIdempotencyConflict):
		status = http.StatusConflict
		code = "IDEMPOTENCY_CONFLICT"
	case errors.Is(err, application.ErrWindowBusy):
		status = http.StatusConflict
		code = "WINDOW_BUSY"
	case errors.Is(err, application.ErrNoEligibleTickets):
		status = http.StatusConflict
		code = "NO_ELIGIBLE_TICKETS"
	case errors.Is(err, application.ErrInvalidState):
		status = http.StatusConflict
		code = "INVALID_TICKET_STATE"
	default:
		status = http.StatusInternalServerError
		code = "INTERNAL_ERROR"
	}

	writeJSONError(w, r, status, code, err.Error())
}

func writeJSONError(w http.ResponseWriter, r *http.Request, status int, code, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(ErrorResponse{
		Error: ErrorDetail{
			Code:      code,
			Message:   msg,
			RequestID: requestID(r),
		},
	})
}

func writeJSONResponse(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

// -----------------------------------------------------------------------------
// Handlers
// -----------------------------------------------------------------------------

func (a *API) ListBranches(w http.ResponseWriter, r *http.Request) {
	branches, err := a.usecases.ListBranches(r.Context())
	if err != nil {
		a.respondError(w, r, err)
		return
	}
	res := ListBranchesResponse{Items: make([]BranchDTO, len(branches))}
	for i, b := range branches {
		res.Items[i] = BranchDTO{ID: b.ID, Name: b.Name}
	}
	writeJSONResponse(w, http.StatusOK, res)
}

func (a *API) ListBranchServices(w http.ResponseWriter, r *http.Request) {
	branchID := chi.URLParam(r, "branchId")
	services, err := a.usecases.ListBranchServices(r.Context(), branchID)
	if err != nil {
		a.respondError(w, r, err)
		return
	}
	res := ListServicesResponse{Items: make([]ServiceDTO, len(services))}
	for i, s := range services {
		res.Items[i] = ServiceDTO{ID: s.ID, Code: s.Code, Name: s.Name}
	}
	writeJSONResponse(w, http.StatusOK, res)
}

type CreateQRTicketRequest struct {
	ServiceID string `json:"serviceId"`
}

func (a *API) CreateQRTicket(w http.ResponseWriter, r *http.Request) {
	branchID := chi.URLParam(r, "branchId")
	idempotencyKey := r.Header.Get("Idempotency-Key")
	if idempotencyKey == "" {
		writeJSONError(w, r, http.StatusBadRequest, "VALIDATION_ERROR", "Missing Idempotency-Key header")
		return
	}

	var req CreateQRTicketRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.ServiceID == "" {
		writeJSONError(w, r, http.StatusBadRequest, "VALIDATION_ERROR", "Invalid request body")
		return
	}

	res, err := a.usecases.CreateQRTicket(r.Context(), application.CreateQRTicketCommand{
		BranchID:       branchID,
		ServiceID:      req.ServiceID,
		IdempotencyKey: idempotencyKey,
	})
	if err != nil {
		a.respondError(w, r, err)
		return
	}

	status := http.StatusCreated
	if res.Replayed {
		status = http.StatusOK
	}
	writeJSONResponse(w, status, mapTicket(res.Ticket))
}

func (a *API) GetTicket(w http.ResponseWriter, r *http.Request) {
	ticketID := chi.URLParam(r, "ticketId")
	ticket, err := a.usecases.GetTicket(r.Context(), ticketID)
	if err != nil {
		a.respondError(w, r, err)
		return
	}
	writeJSONResponse(w, http.StatusOK, mapTicket(ticket))
}

func (a *API) ListBranchWindows(w http.ResponseWriter, r *http.Request) {
	branchID := chi.URLParam(r, "branchId")
	windows, err := a.usecases.ListBranchWindows(r.Context(), branchID)
	if err != nil {
		a.respondError(w, r, err)
		return
	}
	res := make([]WindowDTO, len(windows))
	for i, wnd := range windows {
		services := make([]ServiceDTO, len(wnd.Services))
		for j, s := range wnd.Services {
			services[j] = ServiceDTO{ID: s.ID, Code: s.Code, Name: s.Name}
		}
		res[i] = WindowDTO{
			ID:       wnd.ID,
			Number:   wnd.Number,
			Status:   string(wnd.Status),
			Services: services,
		}
	}
	writeJSONResponse(w, http.StatusOK, res)
}

func (a *API) GetCurrentTicket(w http.ResponseWriter, r *http.Request) {
	windowID := chi.URLParam(r, "windowId")
	ticket, err := a.usecases.GetCurrentTicket(r.Context(), windowID)
	if err != nil {
		a.respondError(w, r, err)
		return
	}
	if ticket == nil {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	writeJSONResponse(w, http.StatusOK, mapTicket(*ticket))
}

func (a *API) CallNext(w http.ResponseWriter, r *http.Request) {
	windowID := chi.URLParam(r, "windowId")
	ticket, err := a.usecases.CallNext(r.Context(), windowID)
	if err != nil {
		a.respondError(w, r, err)
		return
	}
	writeJSONResponse(w, http.StatusOK, mapTicket(ticket))
}

func (a *API) StartService(w http.ResponseWriter, r *http.Request) {
	ticketID := chi.URLParam(r, "ticketId")
	ticket, err := a.usecases.StartService(r.Context(), ticketID)
	if err != nil {
		a.respondError(w, r, err)
		return
	}
	writeJSONResponse(w, http.StatusOK, mapTicket(ticket))
}

func (a *API) CompleteService(w http.ResponseWriter, r *http.Request) {
	ticketID := chi.URLParam(r, "ticketId")
	ticket, err := a.usecases.CompleteService(r.Context(), ticketID)
	if err != nil {
		a.respondError(w, r, err)
		return
	}
	writeJSONResponse(w, http.StatusOK, mapTicket(ticket))
}
