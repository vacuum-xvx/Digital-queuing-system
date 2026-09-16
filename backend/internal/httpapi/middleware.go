package httpapi

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5/middleware"
)

type requestIDKey struct{}

func requestID(r *http.Request) string {
	id, _ := r.Context().Value(requestIDKey{}).(string)
	return id
}

func requestLog(logger *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Generate our own bounded ID; do not trust arbitrary caller-supplied log content.
			var bytes [16]byte
			_, _ = rand.Read(bytes[:])
			id := hex.EncodeToString(bytes[:])
			r = r.WithContext(context.WithValue(r.Context(), requestIDKey{}, id))
			w.Header().Set("X-Request-ID", id)
			wrapped := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
			start := time.Now()
			defer func() {
				status := wrapped.Status()
				if status == 0 {
					status = http.StatusOK
				}
				logger.InfoContext(r.Context(), "HTTP request", "component", "http", "request_id", id, "method", r.Method, "path", r.URL.Path, "status", status, "duration", time.Since(start).String())
			}()
			next.ServeHTTP(wrapped, r)
		})
	}
}

func recoverPanic(logger *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			defer func() {
				if recover() != nil {
					logger.ErrorContext(r.Context(), "HTTP handler panic", "component", "http", "request_id", requestID(r))
					writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "internal_error"})
				}
			}()
			next.ServeHTTP(w, r)
		})
	}
}

func cors(origin string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Add("Vary", "Origin")
			if r.Header.Get("Origin") == origin {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Access-Control-Expose-Headers", "X-Request-ID")
				if r.Method == http.MethodOptions {
					w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
					w.Header().Set("Access-Control-Allow-Headers", "Accept, Content-Type, Idempotency-Key, X-Request-ID")
					w.WriteHeader(http.StatusNoContent)
					return
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}
