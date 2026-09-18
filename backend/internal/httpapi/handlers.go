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
		r.Post("/branches/{branchId}/tickets/live", a.CreateLiveTicket)
		r.Post("/branches/{branchId}/tickets/appointment", a.CreateAppointment)
		r.Post("/appointments", a.CreateAppointment)
		r.Post("/appointments/{ticketId}/cancel", a.CancelAppointment)
		r.Post("/appointments/{ticketId}/arrive", a.ArriveAppointment)
		r.Get("/tickets/{ticketId}", a.GetTicket)
		r.Get("/tickets/{ticketId}/position", a.GetQueuePosition)

		// Authentication endpoints
		r.Route("/auth", func(r chi.Router) {
			r.Post("/request-code", a.RequestConfirmationCode)
			r.Post("/verify-code", a.VerifyConfirmationCode)
			r.Post("/terminal-login", a.LoginTerminal)
			r.Get("/me", a.GetMe)
		})

		r.Route("/operator", func(r chi.Router) {
			r.Use(a.RequireRole(domain.RoleEmployee, domain.RoleChief))
			r.Post("/branches/{branchId}/tickets/live", a.CreateLiveTicket)
			r.Get("/branches/{branchId}/windows", a.ListBranchWindows)
			r.Get("/windows/{windowId}/current-ticket", a.GetCurrentTicket)
			r.Post("/windows/{windowId}/call-next", a.CallNext)
			r.Post("/tickets/{ticketId}/start", a.StartService)
			r.Post("/tickets/{ticketId}/complete", a.CompleteService)
			r.Post("/tickets/{ticketId}/no-show", a.MarkNoShow)
			r.Post("/tickets/{ticketId}/return", a.ReturnTicket)
			r.Post("/tickets/{ticketId}/redirect", a.RedirectTicket)
		})

		r.Route("/admin", func(r chi.Router) {
			r.Use(a.RequireRole(domain.RoleChief))
			r.Get("/branches/{branchId}/overview", a.GetAdminOverview)
			r.Put("/branches/{branchId}/priorities", a.SavePriorityRules)
			r.Get("/branches/{branchId}/queue-policy", a.GetQueuePolicy)
			r.Put("/branches/{branchId}/queue-policy", a.UpdateQueuePolicy)
			r.Get("/tickets/{ticketId}/events", a.ListTicketEvents)
			r.Put("/windows/{windowId}/status", a.ChangeWindowStatus)

			// Employee management
			r.With(a.RequireAuth(domain.RoleChief)).Get("/users", a.ListUsers)
			r.With(a.RequireAuth(domain.RoleChief)).Put("/users/{userId}/role", a.UpdateUserRole)
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
	ID             string `json:"id"`
	Name           string `json:"name"`
	Address        string `json:"address"`
	WorkHours      string `json:"workHours"`
	CloseTime      string `json:"closeTime"`
	TimezoneOffset int    `json:"timezoneOffset"`
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

type ListWindowsResponse struct {
	Items []WindowDTO `json:"items"`
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
	case errors.Is(err, application.ErrWindowClosed):
		status = http.StatusConflict
		code = "WINDOW_CLOSED"
	case errors.Is(err, application.ErrPolicyVersionConflict):
		status = http.StatusConflict
		code = "POLICY_VERSION_CONFLICT"
	case errors.Is(err, application.ErrUnauthorized):
		status = http.StatusUnauthorized
		code = "UNAUTHORIZED"
	case errors.Is(err, application.ErrForbidden):
		status = http.StatusForbidden
		code = "FORBIDDEN"
	case errors.Is(err, application.ErrInvalidCode):
		status = http.StatusBadRequest
		code = "INVALID_CONFIRMATION_CODE"
	default:
		status = http.StatusInternalServerError
		code = "INTERNAL_ERROR"
	}

	message := code
	// Wrapped application errors may contain internal/driver context.
	if status == http.StatusInternalServerError {
		message = "Internal server error"
	}
	writeJSONError(w, r, status, code, message)
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

// Handlers are located in client_handlers.go, operator_handlers.go, and admin_handlers.go
