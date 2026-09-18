package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"postcode/backend/internal/application"
	"postcode/backend/internal/domain"
)

// ─────────────────────────────────────────────────────────────────────────────
// DTOs
// ─────────────────────────────────────────────────────────────────────────────

type registerRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type userDTO struct {
	ID         string `json:"id"`
	Email      string `json:"email"`
	Role       string `json:"role"`
	IsTerminal bool   `json:"isTerminal"`
	Confirmed  bool   `json:"confirmed"`
}

type changeRoleRequest struct {
	Role string `json:"role"`
}

func toUserDTO(u domain.User) userDTO {
	return userDTO{
		ID:         u.ID,
		Email:      u.Email,
		Role:       string(u.Role),
		IsTerminal: u.IsTerminal,
		Confirmed:  u.Confirmed,
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/auth/register
// ─────────────────────────────────────────────────────────────────────────────

func (a *API) Register(w http.ResponseWriter, r *http.Request) {
	var req registerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, r, http.StatusBadRequest, "BAD_REQUEST", "invalid request body")
		return
	}
	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	if req.Email == "" || len(req.Password) < 6 {
		writeJSONError(w, r, http.StatusBadRequest, "VALIDATION", "email required and password must be at least 6 characters")
		return
	}
	u, err := a.usecases.Register(r.Context(), req.Email, req.Password)
	if err != nil {
		a.respondError(w, r, err)
		return
	}
	writeJSONResponse(w, http.StatusCreated, toUserDTO(u))
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/auth/confirm?token=...
// ─────────────────────────────────────────────────────────────────────────────

func (a *API) ConfirmEmail(w http.ResponseWriter, r *http.Request) {
	token := r.URL.Query().Get("token")
	if token == "" {
		writeJSONError(w, r, http.StatusBadRequest, "BAD_REQUEST", "token required")
		return
	}
	if err := a.usecases.ConfirmEmail(r.Context(), token); err != nil {
		a.respondError(w, r, err)
		return
	}
	writeJSONResponse(w, http.StatusOK, map[string]string{"status": "confirmed"})
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/auth/login
// ─────────────────────────────────────────────────────────────────────────────

const sessionCookie = "session"

func (a *API) Login(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, r, http.StatusBadRequest, "BAD_REQUEST", "invalid request body")
		return
	}
	req.Email = strings.TrimSpace(strings.ToLower(req.Email))

	sess, err := a.usecases.Login(r.Context(), req.Email, req.Password)
	if errors.Is(err, application.ErrNotFound) {
		writeJSONError(w, r, http.StatusUnauthorized, "INVALID_CREDENTIALS", "invalid credentials")
		return
	}
	if err != nil {
		a.respondError(w, r, err)
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookie,
		Value:    sess.Token,
		Path:     "/",
		Expires:  sess.ExpiresAt,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})
	writeJSONResponse(w, http.StatusOK, map[string]string{"status": "ok"})
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/auth/logout
// ─────────────────────────────────────────────────────────────────────────────

func (a *API) Logout(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie(sessionCookie)
	if err == nil {
		if err := a.usecases.Logout(r.Context(), cookie.Value); err != nil {
			a.respondError(w, r, err)
			return
		}
	}
	http.SetCookie(w, &http.Cookie{
		Name:    sessionCookie,
		Value:   "",
		Path:    "/",
		Expires: time.Unix(0, 0),
		MaxAge:  -1,
	})
	writeJSONResponse(w, http.StatusOK, map[string]string{"status": "ok"})
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/auth/me
// ─────────────────────────────────────────────────────────────────────────────

func (a *API) GetMe(w http.ResponseWriter, r *http.Request) {
	u, ok := userFromContext(r.Context())
	if !ok {
		writeJSONError(w, r, http.StatusUnauthorized, "UNAUTHENTICATED", "not authenticated")
		return
	}
	writeJSONResponse(w, http.StatusOK, toUserDTO(u))
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/admin/users  (только opc_chief)
// ─────────────────────────────────────────────────────────────────────────────

func (a *API) ListUsers(w http.ResponseWriter, r *http.Request) {
	users, err := a.usecases.ListUsers(r.Context())
	if err != nil {
		a.respondError(w, r, err)
		return
	}
	dtos := make([]userDTO, len(users))
	for i, u := range users {
		dtos[i] = toUserDTO(u)
	}
	writeJSONResponse(w, http.StatusOK, map[string]interface{}{"items": dtos})
}

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/v1/admin/users/{userID}/role  (только opc_chief)
// ─────────────────────────────────────────────────────────────────────────────

func (a *API) ChangeUserRole(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "userID")
	var req changeRoleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, r, http.StatusBadRequest, "BAD_REQUEST", "invalid request body")
		return
	}
	role := domain.UserRole(req.Role)
	switch role {
	case domain.RoleClient, domain.RoleEmployee, domain.RoleOPCChief, domain.RoleTerminal:
	default:
		writeJSONError(w, r, http.StatusBadRequest, "VALIDATION", "invalid role: must be client|employee|opc_chief|terminal")
		return
	}
	u, err := a.usecases.ChangeUserRole(r.Context(), userID, role)
	if err != nil {
		a.respondError(w, r, err)
		return
	}
	writeJSONResponse(w, http.StatusOK, toUserDTO(u))
}
