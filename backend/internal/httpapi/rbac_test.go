package httpapi

import (
	"bytes"
	"context"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"postcode/backend/internal/application"
	"postcode/backend/internal/domain"
)

func setupTestWithRole(uc *FakeUseCases, role domain.UserRole) http.Handler {
	db := &fakeDB{}
	logger := slog.New(slog.NewJSONHandler(bytes.NewBuffer(nil), nil))
	router := NewRouter(db, uc, logger, "http://localhost:3000")
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := context.WithValue(r.Context(), userContextKey{}, domain.User{
			ID:        "test-user",
			Email:     "test@pochta.local",
			Role:      role,
			Confirmed: true,
		})
		router.ServeHTTP(w, r.WithContext(ctx))
	})
}

func TestRBAC_Matrix(t *testing.T) {
	uc := &FakeUseCases{
		UpdateQueuePolicyFunc: func(ctx context.Context, cmd application.UpdateQueuePolicyCommand) (domain.QueuePolicy, error) {
			return domain.QueuePolicy{BranchID: cmd.BranchID}, nil
		},
		CloseShiftFunc: func(ctx context.Context, branchID string) (domain.ShiftClosureResult, error) {
			return domain.ShiftClosureResult{BranchID: branchID}, nil
		},
		UpdateWindowServicesFunc: func(ctx context.Context, cmd application.UpdateWindowServicesCommand) (domain.Window, error) {
			return domain.Window{ID: cmd.WindowID}, nil
		},
		GetAdminOverviewFunc: func(ctx context.Context, branchID string) (domain.AdminBranchOverview, error) {
			return domain.AdminBranchOverview{BranchID: branchID}, nil
		},
		ListAnomaliesFunc: func(ctx context.Context, branchID string, limit, offset int) (domain.AnomalyPage, error) {
			return domain.AnomalyPage{Items: nil, Total: 0}, nil
		},
		SavePriorityRulesFunc: func(ctx context.Context, branchID string, rules []domain.PriorityRule) error {
			return nil
		},
		UpdateBranchScheduleFunc: func(ctx context.Context, branchID string, workHours string) (domain.Branch, error) {
			return domain.Branch{ID: branchID}, nil
		},
		ListTicketEventsFunc: func(ctx context.Context, ticketID string) ([]domain.TicketEvent, error) {
			return nil, nil
		},
		GetQueuePolicyFunc: func(ctx context.Context, branchID string) (domain.QueuePolicy, error) {
			return domain.QueuePolicy{BranchID: branchID, Version: 1}, nil
		},
		ChangeWindowStatusFunc: func(ctx context.Context, windowID string, status domain.WindowStatus) (domain.Window, error) {
			return domain.Window{ID: windowID, Status: status}, nil
		},
		CallNextFunc: func(ctx context.Context, windowID string) (domain.Ticket, error) {
			return domain.Ticket{ID: "t-next"}, nil
		},
	}

	hEmployee := setupTestWithRole(uc, domain.RoleEmployee)
	hChief := setupTestWithRole(uc, domain.RoleOPCChief)
	hClient := setupTestWithRole(uc, domain.RoleClient)

	testCases := []struct {
		name         string
		method       string
		path         string
		body         string
		expectEmp    int
		expectChief  int
		expectClient int
	}{
		// Admin / Chief-only management endpoints
		{
			name:         "UpdateQueuePolicy",
			method:       http.MethodPut,
			path:         "/api/v1/admin/branches/b1/queue-policy",
			body:         `{"appointmentDuePriority":100,"qrPriority":10,"livePriority":10,"antiStarvationThresholdMinutes":15,"antiStarvationPointsPerMinute":10,"appointmentGraceMinutes":15,"appointmentLatePenaltyPerMinute":5,"appointmentLatePenaltyMaxPoints":90,"expectedVersion":1}`,
			expectEmp:    http.StatusForbidden,
			expectChief:  http.StatusOK,
			expectClient: http.StatusForbidden,
		},
		{
			name:         "CloseShift",
			method:       http.MethodPost,
			path:         "/api/v1/admin/branches/b1/close-shift",
			body:         "",
			expectEmp:    http.StatusForbidden,
			expectChief:  http.StatusOK,
			expectClient: http.StatusForbidden,
		},
		{
			name:         "CreateWindow (under admin)",
			method:       http.MethodPost,
			path:         "/api/v1/admin/branches/b1/windows",
			body:         `{"number":5}`,
			expectEmp:    http.StatusForbidden,
			expectChief:  http.StatusCreated,
			expectClient: http.StatusForbidden,
		},
		{
			name:         "CreateWindow (root level)",
			method:       http.MethodPost,
			path:         "/api/v1/branches/b1/windows",
			body:         `{"number":5}`,
			expectEmp:    http.StatusForbidden,
			expectChief:  http.StatusCreated,
			expectClient: http.StatusForbidden,
		},
		{
			name:         "DeleteWindow (under admin)",
			method:       http.MethodDelete,
			path:         "/api/v1/admin/windows/w1",
			body:         "",
			expectEmp:    http.StatusForbidden,
			expectChief:  http.StatusNoContent,
			expectClient: http.StatusForbidden,
		},
		{
			name:         "DeleteWindow (root level)",
			method:       http.MethodDelete,
			path:         "/api/v1/windows/w1",
			body:         "",
			expectEmp:    http.StatusForbidden,
			expectChief:  http.StatusNoContent,
			expectClient: http.StatusForbidden,
		},
		{
			name:         "UpdateWindowServices",
			method:       http.MethodPut,
			path:         "/api/v1/admin/windows/w1/services",
			body:         `{"serviceIds":["s1"]}`,
			expectEmp:    http.StatusOK,
			expectChief:  http.StatusOK,
			expectClient: http.StatusForbidden,
		},
		{
			name:         "GetAdminOverview",
			method:       http.MethodGet,
			path:         "/api/v1/admin/branches/b1/overview",
			body:         "",
			expectEmp:    http.StatusForbidden,
			expectChief:  http.StatusOK,
			expectClient: http.StatusForbidden,
		},
		{
			name:         "ListAnomalies",
			method:       http.MethodGet,
			path:         "/api/v1/admin/branches/b1/anomalies",
			body:         "",
			expectEmp:    http.StatusForbidden,
			expectChief:  http.StatusOK,
			expectClient: http.StatusForbidden,
		},
		{
			name:         "TicketEvents",
			method:       http.MethodGet,
			path:         "/api/v1/admin/tickets/t1/events",
			body:         "",
			expectEmp:    http.StatusForbidden,
			expectChief:  http.StatusOK,
			expectClient: http.StatusForbidden,
		},
		// Operator workplace endpoints (accessible to employee and chief)
		{
			name:         "GetOperatorQueue",
			method:       http.MethodGet,
			path:         "/api/v1/admin/branches/b1/queue",
			body:         "",
			expectEmp:    http.StatusOK,
			expectChief:  http.StatusOK,
			expectClient: http.StatusForbidden,
		},
		{
			name:         "GetQueuePolicy (read)",
			method:       http.MethodGet,
			path:         "/api/v1/admin/branches/b1/queue-policy",
			body:         "",
			expectEmp:    http.StatusOK,
			expectChief:  http.StatusOK,
			expectClient: http.StatusForbidden,
		},
		{
			name:         "ChangeWindowStatus",
			method:       http.MethodPut,
			path:         "/api/v1/admin/windows/w1/status",
			body:         `{"status":"OPEN"}`,
			expectEmp:    http.StatusOK,
			expectChief:  http.StatusOK,
			expectClient: http.StatusForbidden,
		},
		{
			name:         "CallNext",
			method:       http.MethodPost,
			path:         "/api/v1/operator/windows/w1/call-next",
			body:         "",
			expectEmp:    http.StatusOK,
			expectChief:  http.StatusOK,
			expectClient: http.StatusForbidden,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			// Employee
			reqEmp := httptest.NewRequest(tc.method, tc.path, bytes.NewBufferString(tc.body))
			if tc.body != "" {
				reqEmp.Header.Set("Content-Type", "application/json")
			}
			recEmp := httptest.NewRecorder()
			hEmployee.ServeHTTP(recEmp, reqEmp)
			if recEmp.Code != tc.expectEmp {
				t.Errorf("[%s] employee: expected %d, got %d", tc.name, tc.expectEmp, recEmp.Code)
			}

			// Chief
			reqChief := httptest.NewRequest(tc.method, tc.path, bytes.NewBufferString(tc.body))
			if tc.body != "" {
				reqChief.Header.Set("Content-Type", "application/json")
			}
			recChief := httptest.NewRecorder()
			hChief.ServeHTTP(recChief, reqChief)
			if recChief.Code != tc.expectChief {
				t.Errorf("[%s] chief: expected %d, got %d", tc.name, tc.expectChief, recChief.Code)
			}

			// Client
			reqClient := httptest.NewRequest(tc.method, tc.path, bytes.NewBufferString(tc.body))
			if tc.body != "" {
				reqClient.Header.Set("Content-Type", "application/json")
			}
			recClient := httptest.NewRecorder()
			hClient.ServeHTTP(recClient, reqClient)
			if recClient.Code != tc.expectClient {
				t.Errorf("[%s] client: expected %d, got %d", tc.name, tc.expectClient, recClient.Code)
			}
		})
	}
}
