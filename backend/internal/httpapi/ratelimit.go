package httpapi

import (
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"golang.org/x/time/rate"
)

type ipLimiter struct {
	mu       sync.Mutex
	limiters map[string]*limiterEntry
	rate     rate.Limit
	burst    int
}

type limiterEntry struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

func newIPLimiter(r rate.Limit, burst int) *ipLimiter {
	l := &ipLimiter{
		limiters: make(map[string]*limiterEntry),
		rate:     r,
		burst:    burst,
	}
	go l.cleanupWorker()
	return l
}

func clientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		parts := strings.Split(xff, ",")
		if len(parts) > 0 {
			ip := strings.TrimSpace(parts[0])
			if ip != "" {
				return ip
			}
		}
	}
	if xri := r.Header.Get("X-Real-IP"); xri != "" {
		return strings.TrimSpace(xri)
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err == nil {
		return host
	}
	return r.RemoteAddr
}

func (l *ipLimiter) get(ip string) *rate.Limiter {
	l.mu.Lock()
	defer l.mu.Unlock()
	entry, ok := l.limiters[ip]
	if !ok {
		entry = &limiterEntry{
			limiter: rate.NewLimiter(l.rate, l.burst),
		}
		l.limiters[ip] = entry
	}
	entry.lastSeen = time.Now()
	return entry.limiter
}

func (l *ipLimiter) cleanupWorker() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		l.mu.Lock()
		now := time.Now()
		for ip, e := range l.limiters {
			if now.Sub(e.lastSeen) > 10*time.Minute {
				delete(l.limiters, ip)
			}
		}
		l.mu.Unlock()
	}
}

// RateLimit returns a middleware that limits requests per IP.
func RateLimit(rps float64, burst int) func(http.Handler) http.Handler {
	lim := newIPLimiter(rate.Limit(rps), burst)
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ip := clientIP(r)
			if !lim.get(ip).Allow() {
				writeJSONError(w, r, http.StatusTooManyRequests, "RATE_LIMITED", "Too many requests, please try again later")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
