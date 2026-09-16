package httpapi

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"postcode/backend/internal/application"
)

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

type CreateLiveTicketRequest struct {
	ServiceID string `json:"serviceId"`
}

func (a *API) CreateLiveTicket(w http.ResponseWriter, r *http.Request) {
	branchID := chi.URLParam(r, "branchId")
	idempotencyKey := r.Header.Get("Idempotency-Key")
	if idempotencyKey == "" {
		writeJSONError(w, r, http.StatusBadRequest, "VALIDATION_ERROR", "Missing Idempotency-Key header")
		return
	}
	
	var req CreateLiveTicketRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.ServiceID == "" {
		writeJSONError(w, r, http.StatusBadRequest, "VALIDATION_ERROR", "Invalid request body")
		return
	}

	ticket, err := a.usecases.CreateLiveTicket(r.Context(), application.CreateLiveTicketCommand{
		BranchID:       branchID,
		ServiceID:      req.ServiceID,
		IdempotencyKey: idempotencyKey,
	})
	if err != nil {
		a.respondError(w, r, err)
		return
	}

	writeJSONResponse(w, http.StatusCreated, mapTicket(ticket))
}

type CreateAppointmentRequest struct {
	ServiceID   string `json:"serviceId"`
	ScheduledAt string `json:"scheduledAt"`
}

func (a *API) CreateAppointment(w http.ResponseWriter, r *http.Request) {
	branchID := chi.URLParam(r, "branchId")
	idempotencyKey := r.Header.Get("Idempotency-Key")
	if idempotencyKey == "" {
		writeJSONError(w, r, http.StatusBadRequest, "VALIDATION_ERROR", "Missing Idempotency-Key header")
		return
	}

	var req CreateAppointmentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.ServiceID == "" || req.ScheduledAt == "" {
		writeJSONError(w, r, http.StatusBadRequest, "VALIDATION_ERROR", "Invalid request body")
		return
	}

	ticket, err := a.usecases.CreateAppointment(r.Context(), application.CreateAppointmentCommand{
		BranchID:       branchID,
		ServiceID:      req.ServiceID,
		ScheduledAt:    req.ScheduledAt,
		IdempotencyKey: idempotencyKey,
	})
	if err != nil {
		a.respondError(w, r, err)
		return
	}

	writeJSONResponse(w, http.StatusCreated, mapTicket(ticket))
}
