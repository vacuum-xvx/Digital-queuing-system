package httpapi

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"postcode/backend/internal/application"
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

	switch domain.WindowStatus(req.Status) {
	case domain.WindowStatusClosed, domain.WindowStatusOpen, domain.WindowStatusClosing:
		// valid
	default:
		writeJSONError(w, r, http.StatusBadRequest, "VALIDATION_ERROR",
			"status must be one of CLOSED, OPEN, CLOSING")
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

type QueuePolicyDTO struct {
	BranchID               string    `json:"branchId"`
	AppointmentDuePriority int       `json:"appointmentDuePriority"`
	QRPriority             int       `json:"qrPriority"`
	Version                int64     `json:"version"`
	UpdatedAt              time.Time `json:"updatedAt"`
}

func (a *API) GetQueuePolicy(w http.ResponseWriter, r *http.Request) {
	branchID := chi.URLParam(r, "branchId")
	policy, err := a.usecases.GetQueuePolicy(r.Context(), branchID)
	if err != nil {
		a.respondError(w, r, err)
		return
	}
	writeJSONResponse(w, http.StatusOK, QueuePolicyDTO{
		BranchID:               policy.BranchID,
		AppointmentDuePriority: policy.AppointmentDuePriority,
		QRPriority:             policy.QRPriority,
		Version:                policy.Version,
		UpdatedAt:              policy.UpdatedAt,
	})
}

type UpdateQueuePolicyRequest struct {
	AppointmentDuePriority int   `json:"appointmentDuePriority"`
	QRPriority             int   `json:"qrPriority"`
	ExpectedVersion        int64 `json:"expectedVersion"`
}

func (a *API) UpdateQueuePolicy(w http.ResponseWriter, r *http.Request) {
	branchID := chi.URLParam(r, "branchId")

	var req UpdateQueuePolicyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, r, http.StatusBadRequest, "VALIDATION_ERROR", "Invalid request body")
		return
	}

	if req.AppointmentDuePriority < 0 || req.AppointmentDuePriority > 1000 ||
		req.QRPriority < 0 || req.QRPriority > 1000 ||
		req.AppointmentDuePriority <= req.QRPriority {
		writeJSONError(w, r, http.StatusBadRequest, "VALIDATION_ERROR", "Invalid priority values")
		return
	}

	policy, err := a.usecases.UpdateQueuePolicy(r.Context(), application.UpdateQueuePolicyCommand{
		BranchID:               branchID,
		AppointmentDuePriority: req.AppointmentDuePriority,
		QRPriority:             req.QRPriority,
		ExpectedVersion:        req.ExpectedVersion,
	})
	if err != nil {
		a.respondError(w, r, err)
		return
	}

	writeJSONResponse(w, http.StatusOK, QueuePolicyDTO{
		BranchID:               policy.BranchID,
		AppointmentDuePriority: policy.AppointmentDuePriority,
		QRPriority:             policy.QRPriority,
		Version:                policy.Version,
		UpdatedAt:              policy.UpdatedAt,
	})
}

type ListTicketEventsResponse struct {
	Items []TicketEventDTO `json:"items"`
}

type TicketEventDTO struct {
	ID               int64      `json:"id"`
	Type             string     `json:"type"`
	FromStatus       *string    `json:"fromStatus"`
	ToStatus         string     `json:"toStatus"`
	WindowID         *string    `json:"windowId"`
	PolicyVersion    *int64     `json:"policyVersion"`
	DecisionPriority *int       `json:"decisionPriority"`
	OccurredAt       time.Time  `json:"occurredAt"`
}

func (a *API) ListTicketEvents(w http.ResponseWriter, r *http.Request) {
	ticketID := chi.URLParam(r, "ticketId")
	events, err := a.usecases.ListTicketEvents(r.Context(), ticketID)
	if err != nil {
		a.respondError(w, r, err)
		return
	}

	items := make([]TicketEventDTO, len(events))
	for i, e := range events {
		var fromStatus *string
		if e.FromStatus != nil {
			s := string(*e.FromStatus)
			fromStatus = &s
		}
		items[i] = TicketEventDTO{
			ID:               e.ID,
			Type:             string(e.Type),
			FromStatus:       fromStatus,
			ToStatus:         string(e.ToStatus),
			WindowID:         e.WindowID,
			PolicyVersion:    e.PolicyVersion,
			DecisionPriority: e.DecisionPriority,
			OccurredAt:       e.OccurredAt,
		}
	}

	writeJSONResponse(w, http.StatusOK, ListTicketEventsResponse{
		Items: items,
	})
}
