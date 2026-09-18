package httpapi

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"postcode/backend/internal/domain"
)

type ListUsersResponse struct {
	Items []UserDTO `json:"items"`
}

type UpdateUserRoleRequest struct {
	Role domain.UserRole `json:"role"`
}

func (a *API) ListUsers(w http.ResponseWriter, r *http.Request) {
	branchID := r.URL.Query().Get("branchId")

	users, err := a.usecases.ListUsers(r.Context(), branchID)
	if err != nil {
		a.respondError(w, r, err)
		return
	}

	items := make([]UserDTO, len(users))
	for i, u := range users {
		items[i] = mapUser(u)
	}

	writeJSONResponse(w, http.StatusOK, ListUsersResponse{Items: items})
}

func (a *API) UpdateUserRole(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "userId")
	if userID == "" {
		writeJSONError(w, r, http.StatusBadRequest, "INVALID_REQUEST", "userId parameter is required")
		return
	}

	var req UpdateUserRoleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, r, http.StatusBadRequest, "INVALID_REQUEST", "invalid request body")
		return
	}

	switch req.Role {
	case domain.RoleClient, domain.RoleEmployee, domain.RoleChief:
	default:
		writeJSONError(w, r, http.StatusBadRequest, "INVALID_ROLE", "invalid user role, must be client, employee, or opc_chief")
		return
	}

	user, err := a.usecases.UpdateUserRole(r.Context(), userID, req.Role)
	if err != nil {
		a.respondError(w, r, err)
		return
	}

	writeJSONResponse(w, http.StatusOK, mapUser(user))
}
