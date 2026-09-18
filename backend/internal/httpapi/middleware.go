package httpapi

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5/middleware"
	"postcode/backend/internal/domain"
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
					writeJSONError(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "Internal server error")
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
					w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
					w.Header().Set("Access-Control-Allow-Headers", "Accept, Content-Type, Authorization, Idempotency-Key, X-Request-ID")
					w.WriteHeader(http.StatusNoContent)
					return
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}

type userCtxKey struct{}

func contextWithUser(ctx context.Context, claims AuthClaims) context.Context {
	return context.WithValue(ctx, userCtxKey{}, claims)
}

func userFromContext(ctx context.Context) (AuthClaims, bool) {
	claims, ok := ctx.Value(userCtxKey{}).(AuthClaims)
	return claims, ok
}

func authMiddleware() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" {
				next.ServeHTTP(w, r)
				return
			}

			parts := strings.SplitN(authHeader, " ", 2)
			if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
				writeJSONError(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "invalid authorization header format")
				return
			}

			claims, err := ParseToken(parts[1])
			if err != nil {
				writeJSONError(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "invalid or expired token")
				return
			}

			r = r.WithContext(contextWithUser(r.Context(), claims))
			next.ServeHTTP(w, r)
		})
	}
}

func (a *API) RequireRole(allowed ...domain.UserRole) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			claims, ok := userFromContext(r.Context())
			if ok {
				allowedMap := make(map[domain.UserRole]bool)
				for _, role := range allowed {
					allowedMap[role] = true
				}
				if !allowedMap[claims.Role] {
					writeJSONError(w, r, http.StatusForbidden, "FORBIDDEN", "access denied for user role "+string(claims.Role))
					return
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}

func (a *API) RequireAuth(allowed ...domain.UserRole) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			claims, ok := userFromContext(r.Context())
			if !ok {
				writeJSONError(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "authentication required")
				return
			}
			if len(allowed) > 0 {
				allowedMap := make(map[domain.UserRole]bool)
				for _, role := range allowed {
					allowedMap[role] = true
				}
				if !allowedMap[claims.Role] {
					writeJSONError(w, r, http.StatusForbidden, "FORBIDDEN", "access denied for user role "+string(claims.Role))
					return
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}

