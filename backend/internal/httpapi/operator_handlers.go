package httpapi

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"postcode/backend/internal/application"
	"postcode/backend/internal/domain"
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
		res[i] = mapWindowDTO(wnd)
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

type callNextRequest struct {
	TicketID     string `json:"ticketId"`
	PublicNumber string `json:"publicNumber"`
}

func (a *API) CallNext(w http.ResponseWriter, r *http.Request) {
	windowID := chi.URLParam(r, "windowId")

	var target string
	if r.Body != nil {
		var req callNextRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err == nil {
			target = strings.TrimSpace(req.TicketID)
			if target == "" {
				target = strings.TrimSpace(req.PublicNumber)
			}
		}
	}
	if target == "" {
		target = strings.TrimSpace(r.URL.Query().Get("ticketId"))
	}
	if target == "" {
		target = strings.TrimSpace(r.URL.Query().Get("publicNumber"))
	}
	if target == "" {
		target = strings.TrimSpace(r.URL.Query().Get("ticket"))
	}

	var ticket domain.Ticket
	var err error
	if target != "" {
		ticket, err = a.usecases.CallSpecificTicket(r.Context(), windowID, target)
	} else {
		ticket, err = a.usecases.CallNext(r.Context(), windowID)
	}
	if err != nil {
		a.respondError(w, r, err)
		return
	}
	a.publishTicketUpdate(ticket, "called")
	writeJSONResponse(w, http.StatusOK, mapTicket(ticket))
}

func (a *API) StartService(w http.ResponseWriter, r *http.Request) {
	ticketID := chi.URLParam(r, "ticketId")
	ticket, err := a.usecases.StartService(r.Context(), ticketID)
	if err != nil {
		a.respondError(w, r, err)
		return
	}
	a.publishTicketUpdate(ticket, "service_started")
	writeJSONResponse(w, http.StatusOK, mapTicket(ticket))
}

func (a *API) CompleteService(w http.ResponseWriter, r *http.Request) {
	ticketID := chi.URLParam(r, "ticketId")
	ticket, err := a.usecases.CompleteService(r.Context(), ticketID)
	if err != nil {
		a.respondError(w, r, err)
		return
	}
	a.publishTicketUpdate(ticket, "completed")
	writeJSONResponse(w, http.StatusOK, mapTicket(ticket))
}

func (a *API) ReturnTicket(w http.ResponseWriter, r *http.Request) {
	ticketID := chi.URLParam(r, "ticketId")
	ticket, err := a.usecases.ReturnTicket(r.Context(), ticketID)
	if err != nil {
		a.respondError(w, r, err)
		return
	}
	a.publishTicketUpdate(ticket, "returned")
	writeJSONResponse(w, http.StatusOK, mapTicket(ticket))
}

type RedirectTicketRequest struct {
	NewServiceID   string `json:"newServiceId"`
	NewWindowID    string `json:"newWindowId"`
	TargetWindowID string `json:"targetWindowId"`
}

func (a *API) RedirectTicket(w http.ResponseWriter, r *http.Request) {
	ticketID := chi.URLParam(r, "ticketId")

	var req RedirectTicketRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, r, http.StatusBadRequest, "VALIDATION_ERROR", "Invalid request body")
		return
	}
	if req.NewWindowID == "" && req.TargetWindowID != "" {
		req.NewWindowID = req.TargetWindowID
	}
	if req.NewServiceID == "" && req.NewWindowID == "" {
		writeJSONError(w, r, http.StatusBadRequest, "VALIDATION_ERROR", "Either newServiceId or newWindowId is required")
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
	a.publishTicketUpdate(ticket, "redirected")
	writeJSONResponse(w, http.StatusOK, mapTicket(ticket))
}
