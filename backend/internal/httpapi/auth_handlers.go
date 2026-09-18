package httpapi

import (
	"encoding/json"
	"net/http"
	"time"

	"postcode/backend/internal/domain"
)

type UserDTO struct {
	ID         string          `json:"id"`
	Email      string          `json:"email"`
	Role       domain.UserRole `json:"role"`
	BranchID   *string         `json:"branchId,omitempty"`
	IsTerminal bool            `json:"isTerminal"`
	CreatedAt  time.Time       `json:"createdAt"`
}

func mapUser(u domain.User) UserDTO {
	return UserDTO{
		ID:         u.ID,
		Email:      u.Email,
		Role:       u.Role,
		BranchID:   u.BranchID,
		IsTerminal: u.IsTerminal,
		CreatedAt:  u.CreatedAt,
	}
}

type RequestCodeRequest struct {
	Email string `json:"email"`
}

type RequestCodeResponse struct {
	Status  string `json:"status"`
	Message string `json:"message"`
	DevCode string `json:"devCode,omitempty"`
}

func (a *API) RequestConfirmationCode(w http.ResponseWriter, r *http.Request) {
	var req RequestCodeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, r, http.StatusBadRequest, "INVALID_REQUEST", "invalid request body")
		return
	}

	code, err := a.usecases.RequestConfirmationCode(r.Context(), req.Email)
	if err != nil {
		a.respondError(w, r, err)
		return
	}

	writeJSONResponse(w, http.StatusOK, RequestCodeResponse{
		Status:  "ok",
		Message: "Confirmation code sent",
		DevCode: code,
	})
}

type VerifyCodeRequest struct {
	Email string `json:"email"`
	Code  string `json:"code"`
}

type AuthResponse struct {
	Token string  `json:"token"`
	User  UserDTO `json:"user"`
}

func (a *API) VerifyConfirmationCode(w http.ResponseWriter, r *http.Request) {
	var req VerifyCodeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, r, http.StatusBadRequest, "INVALID_REQUEST", "invalid request body")
		return
	}

	user, err := a.usecases.VerifyConfirmationCode(r.Context(), req.Email, req.Code)
	if err != nil {
		a.respondError(w, r, err)
		return
	}

	token, err := GenerateToken(AuthClaims{
		UserID:     user.ID,
		Email:      user.Email,
		Role:       user.Role,
		BranchID:   user.BranchID,
		IsTerminal: user.IsTerminal,
	})
	if err != nil {
		writeJSONError(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to generate auth token")
		return
	}

	writeJSONResponse(w, http.StatusOK, AuthResponse{
		Token: token,
		User:  mapUser(user),
	})
}

type TerminalLoginRequest struct {
	DeviceToken string `json:"deviceToken"`
}

func (a *API) LoginTerminal(w http.ResponseWriter, r *http.Request) {
	var req TerminalLoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, r, http.StatusBadRequest, "INVALID_REQUEST", "invalid request body")
		return
	}

	user, err := a.usecases.LoginTerminal(r.Context(), req.DeviceToken)
	if err != nil {
		a.respondError(w, r, err)
		return
	}

	token, err := GenerateToken(AuthClaims{
		UserID:     user.ID,
		Email:      user.Email,
		Role:       user.Role,
		BranchID:   user.BranchID,
		IsTerminal: true,
	})
	if err != nil {
		writeJSONError(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to generate auth token")
		return
	}

	writeJSONResponse(w, http.StatusOK, AuthResponse{
		Token: token,
		User:  mapUser(user),
	})
}

func (a *API) GetMe(w http.ResponseWriter, r *http.Request) {
	claims, ok := userFromContext(r.Context())
	if !ok {
		writeJSONError(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "authentication required")
		return
	}

	user, err := a.usecases.GetUserByID(r.Context(), claims.UserID)
	if err != nil {
		// If user not in DB, fallback to claims
		writeJSONResponse(w, http.StatusOK, UserDTO{
			ID:         claims.UserID,
			Email:      claims.Email,
			Role:       claims.Role,
			BranchID:   claims.BranchID,
			IsTerminal: claims.IsTerminal,
		})
		return
	}

	writeJSONResponse(w, http.StatusOK, mapUser(user))
}
