package httpapi

import (
	"bytes"
	"context"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type fakeDB struct {
	err   error
	calls int
}

func (f *fakeDB) Ping(context.Context) error { f.calls++; return f.err }

func TestHealthAndReadiness(t *testing.T) {
	for _, tc := range []struct {
		name, path string
		dbErr      error
		status     int
		body       string
		calls      int
	}{
		{"liveness with database down", "/health", errors.New("secret DSN"), 200, `{"status":"ok"}`, 0},
		{"ready", "/ready", nil, 200, `{"database":"ok","status":"ready"}`, 1},
		{"database down", "/ready", errors.New("secret DSN"), 503, `{"database":"unavailable","status":"not_ready"}`, 1},
	} {
		t.Run(tc.name, func(t *testing.T) {
			db := &fakeDB{err: tc.dbErr}
			var logs bytes.Buffer
			router := NewRouter(db, nil, slog.New(slog.NewJSONHandler(&logs, nil)), "http://localhost:5173")
			response := httptest.NewRecorder()
			router.ServeHTTP(response, httptest.NewRequest(http.MethodGet, tc.path, nil))
			if response.Code != tc.status || strings.TrimSpace(response.Body.String()) != tc.body {
				t.Fatalf("unexpected response: %d %s", response.Code, response.Body.String())
			}
			if response.Header().Get("Content-Type") != "application/json" {
				t.Fatal("missing JSON content type")
			}
			if db.calls != tc.calls {
				t.Fatalf("ping calls = %d, want %d", db.calls, tc.calls)
			}
			if response.Header().Get("X-Request-ID") == "" {
				t.Fatal("missing request id")
			}
			if strings.Contains(logs.String(), "secret DSN") {
				t.Fatal("connection error leaked")
			}
			for _, field := range []string{`"request_id"`, `"method"`, `"path"`, `"status"`, `"duration"`} {
				if !strings.Contains(logs.String(), field) {
					t.Fatalf("missing log field %s", field)
				}
			}
		})
	}
}

func TestPanicRecovery(t *testing.T) {
	var logs bytes.Buffer
	handler := recoverPanic(slog.New(slog.NewJSONHandler(&logs, nil)))(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { panic("private panic detail") }))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/", nil))
	if response.Code != 500 || strings.TrimSpace(response.Body.String()) != `{"error":{"code":"INTERNAL_ERROR","message":"Internal server error","requestId":""}}` {
		t.Fatalf("unsafe panic response: %d %s", response.Code, response.Body.String())
	}
	if strings.Contains(logs.String(), "private panic detail") {
		t.Fatal("panic detail leaked")
	}
}

func TestCORS(t *testing.T) {
	for _, origin := range []string{"http://localhost:5173", "http://untrusted.example"} {
		router := NewRouter(&fakeDB{}, nil, slog.Default(), "http://localhost:5173")
		response := httptest.NewRecorder()
		request := httptest.NewRequest(http.MethodGet, "/health", nil)
		request.Header.Set("Origin", origin)
		router.ServeHTTP(response, request)
		allowed := response.Header().Get("Access-Control-Allow-Origin")
		if origin == "http://localhost:5173" && allowed != origin {
			t.Fatal("local frontend blocked")
		}
		if origin != "http://localhost:5173" && allowed != "" {
			t.Fatal("untrusted origin allowed")
		}
	}
}
