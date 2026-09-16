package httpapi

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"postcode/backend/internal/application"
)

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
	writeJSONResponse(w, http.StatusOK, ListWindowsResponse{Items: res})
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

func (a *API) ReturnTicket(w http.ResponseWriter, r *http.Request) {
	ticketID := chi.URLParam(r, "ticketId")
	ticket, err := a.usecases.ReturnTicket(r.Context(), ticketID)
	if err != nil {
		a.respondError(w, r, err)
		return
	}
	writeJSONResponse(w, http.StatusOK, mapTicket(ticket))
}

type RedirectTicketRequest struct {
	NewServiceID string `json:"newServiceId"`
	NewWindowID  string `json:"newWindowId"`
}

func (a *API) RedirectTicket(w http.ResponseWriter, r *http.Request) {
	ticketID := chi.URLParam(r, "ticketId")

	var req RedirectTicketRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.NewServiceID == "" {
		writeJSONError(w, r, http.StatusBadRequest, "VALIDATION_ERROR", "Invalid request body, newServiceId is required")
		return
	}

	ticket, err := a.usecases.RedirectTicket(r.Context(), application.RedirectTicketCommand{
		TicketID:     ticketID,
		NewServiceID: req.NewServiceID,
		NewWindowID:  req.NewWindowID,
	})
	if err != nil {
		a.respondError(w, r, err)
		return
	}
	writeJSONResponse(w, http.StatusOK, mapTicket(ticket))
}
