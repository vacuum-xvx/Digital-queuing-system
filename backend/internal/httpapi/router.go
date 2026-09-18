package httpapi

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"postcode/backend/internal/application"
)

// Pinger is the small boundary needed to test readiness without PostgreSQL.
type Pinger interface{ Ping(context.Context) error }

func NewRouter(db Pinger, usecases application.UseCases, logger *slog.Logger, origin string) http.Handler {
	r := chi.NewRouter()
	r.Use(requestLog(logger), recoverPanic(logger), cors(origin), authMiddleware())
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	r.Get("/ready", func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		if err := db.Ping(ctx); err != nil {
			// Driver errors can contain connection details. Log a safe diagnostic instead.
			logger.ErrorContext(ctx, "PostgreSQL readiness check failed", "component", "database", "request_id", requestID(r), "error", "database unavailable or ping timed out")
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "not_ready", "database": "unavailable"})
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ready", "database": "ok"})
	})

	api := NewAPI(usecases)
	api.RegisterRoutes(r)

	return r
}

func writeJSON(w http.ResponseWriter, status int, body map[string]string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
