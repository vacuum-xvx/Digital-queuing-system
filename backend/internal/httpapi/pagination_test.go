package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"postcode/backend/internal/domain"
)

func TestAdminListPagination(t *testing.T) {
	uc := &FakeUseCases{
		ListUsersFunc: func(_ context.Context, limit, offset int, search, role string) (domain.UserPage, error) {
			if limit != 50 || offset != 50 || search != "post" || role != "employee" {
				t.Fatalf("unexpected user filters: %d %d %q %q", limit, offset, search, role)
			}
			return domain.UserPage{Items: []domain.User{{ID: "u2", Email: "post@example.test"}}, Total: 91}, nil
		},
		ListAnomaliesFunc: func(_ context.Context, branchID string, limit, offset int) (domain.AnomalyPage, error) {
			if branchID != "branch" || limit != 50 || offset != 50 {
				t.Fatalf("unexpected anomaly filters: %q %d %d", branchID, limit, offset)
			}
			return domain.AnomalyPage{Items: []domain.AnomalyTicket{{ID: "a1"}}, Total: 51}, nil
		},
	}
	for _, tc := range []struct {
		path  string
		total int
	}{
		{"/api/v1/admin/users?limit=50&offset=50&search=post&role=employee", 91},
		{"/api/v1/admin/branches/branch/anomalies?limit=50&offset=50", 51},
	} {
		rec := httptest.NewRecorder()
		setupTest(uc).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, tc.path, nil))
		if rec.Code != http.StatusOK {
			t.Fatalf("%s: %d %s", tc.path, rec.Code, rec.Body.String())
		}
		var response struct {
			Items  []json.RawMessage `json:"items"`
			Total  int               `json:"total"`
			Limit  int               `json:"limit"`
			Offset int               `json:"offset"`
		}
		if err := json.Unmarshal(rec.Body.Bytes(), &response); err != nil {
			t.Fatal(err)
		}
		if response.Total != tc.total || len(response.Items) != 1 || response.Limit != 50 || response.Offset != 50 {
			t.Fatalf("%s: unexpected page %+v", tc.path, response)
		}
	}
}

func TestAdminListRejectsUnboundedRequests(t *testing.T) {
	for _, path := range []string{
		"/api/v1/admin/users?limit=51", "/api/v1/admin/users?offset=-1",
		"/api/v1/admin/branches/branch/anomalies?limit=oops",
	} {
		rec := httptest.NewRecorder()
		setupTest(&FakeUseCases{}).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("%s: %d", path, rec.Code)
		}
	}
}

func TestUserCountsAndPageSizes(t *testing.T) {
	counts := domain.UserCounts{All: 102, Employee: 60, OPCChief: 2, Client: 39, Terminal: 1}
	for _, size := range []string{"10", "25", "50"} {
		uc := &FakeUseCases{ListUsersFunc: func(_ context.Context, limit, offset int, search, role string) (domain.UserPage, error) {
			return domain.UserPage{Items: []domain.User{}, Total: 60, Counts: counts}, nil
		}}
		rec := httptest.NewRecorder()
		setupTest(uc).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/v1/admin/users?role=employee&limit="+size, nil))
		var response struct {
			Counts domain.UserCounts `json:"counts"`
			Total  int               `json:"total"`
		}
		if err := json.Unmarshal(rec.Body.Bytes(), &response); err != nil {
			t.Fatal(err)
		}
		if rec.Code != http.StatusOK || response.Counts != counts || response.Total != 60 {
			t.Fatalf("size %s: %s", size, rec.Body.String())
		}
	}
}
