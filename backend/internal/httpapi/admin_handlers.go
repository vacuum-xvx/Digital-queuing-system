package httpapi

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"postcode/backend/internal/domain"
)

type ChangeWindowStatusRequest struct {
	Status string `json:"status"`
}

func (a *API) ChangeWindowStatus(w http.ResponseWriter, r *http.Request) {
	windowID := chi.URLParam(r, "windowId")

	var req ChangeWindowStatusRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Status == "" {
		writeJSONError(w, r, http.StatusBadRequest, "VALIDATION_ERROR", "Invalid request body")
		return
	}

	wnd, err := a.usecases.ChangeWindowStatus(r.Context(), windowID, domain.WindowStatus(req.Status))
	if err != nil {
		a.respondError(w, r, err)
		return
	}

	services := make([]ServiceDTO, len(wnd.Services))
	for j, s := range wnd.Services {
		services[j] = ServiceDTO{ID: s.ID, Code: s.Code, Name: s.Name}
	}
	
	writeJSONResponse(w, http.StatusOK, WindowDTO{
		ID:       wnd.ID,
		Number:   wnd.Number,
		Status:   string(wnd.Status),
		Services: services,
	})
}

func (a *API) GetAdminOverview(w http.ResponseWriter, r *http.Request) {
	branchID := chi.URLParam(r, "branchId")
	overview, err := a.usecases.GetAdminOverview(r.Context(), branchID)
	if err != nil {
		a.respondError(w, r, err)
		return
	}
	writeJSONResponse(w, http.StatusOK, overview)
}

func (a *API) SavePriorityRules(w http.ResponseWriter, r *http.Request) {
	branchID := chi.URLParam(r, "branchId")
	var rules []domain.PriorityRule
	if err := json.NewDecoder(r.Body).Decode(&rules); err != nil {
		writeJSONError(w, r, http.StatusBadRequest, "VALIDATION_ERROR", "Invalid request body")
		return
	}
	err := a.usecases.SavePriorityRules(r.Context(), branchID, rules)
	if err != nil {
		a.respondError(w, r, err)
		return
	}
	writeJSONResponse(w, http.StatusOK, rules)
}
