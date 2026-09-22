package notification

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"postcode/backend/internal/domain"
)

type DemoMode string

const (
	DemoModeSuccess DemoMode = "SUCCESS"
	DemoModeFail    DemoMode = "FAIL"
	DemoModeTimeout DemoMode = "TIMEOUT"
)

// DemoServer is an in-memory mock HTTP notification service.
type DemoServer struct {
	mu       sync.RWMutex
	mode     DemoMode
	history  []domain.NotificationMessage
	seenIDs  map[string]int
	logger   *slog.Logger
	timeoutD time.Duration
}

func NewDemoServer(logger *slog.Logger) *DemoServer {
	if logger == nil {
		logger = slog.Default()
	}
	return &DemoServer{
		mode:     DemoModeSuccess,
		history:  make([]domain.NotificationMessage, 0),
		seenIDs:  make(map[string]int),
		logger:   logger,
		timeoutD: 6 * time.Second,
	}
}

func (s *DemoServer) SetMode(mode DemoMode) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.mode = mode
}

func (s *DemoServer) GetMode() DemoMode {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.mode
}

func (s *DemoServer) History() []domain.NotificationMessage {
	s.mu.RLock()
	defer s.mu.RUnlock()
	copied := make([]domain.NotificationMessage, len(s.history))
	copy(copied, s.history)
	return copied
}

func (s *DemoServer) Reset() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.history = make([]domain.NotificationMessage, 0)
	s.seenIDs = make(map[string]int)
	s.mode = DemoModeSuccess
}

func (s *DemoServer) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", s.handleHealth)
	mux.HandleFunc("/notify", s.handleNotify)
	mux.HandleFunc("/mode", s.handleMode)
	mux.HandleFunc("/history", s.handleHistory)
	mux.HandleFunc("/reset", s.handleReset)
	return mux
}

func (s *DemoServer) handleHealth(w http.ResponseWriter, r *http.Request) {
	s.mu.RLock()
	mode := s.mode
	s.mu.RUnlock()

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"status": "ok",
		"mode":   mode,
	})
}

func (s *DemoServer) handleNotify(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	s.mu.RLock()
	mode := s.mode
	timeoutD := s.timeoutD
	s.mu.RUnlock()

	switch mode {
	case DemoModeFail:
		s.logger.Warn("demo notification service simulating failure", "mode", mode)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusServiceUnavailable)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"error": "demo notification service unavailable",
		})
		return

	case DemoModeTimeout:
		s.logger.Warn("demo notification service simulating timeout", "duration", timeoutD)
		select {
		case <-time.After(timeoutD):
		case <-r.Context().Done():
			return
		}
		w.WriteHeader(http.StatusGatewayTimeout)
		return

	case DemoModeSuccess:
		var msg domain.NotificationMessage
		if err := json.NewDecoder(r.Body).Decode(&msg); err != nil {
			http.Error(w, fmt.Sprintf("invalid payload: %v", err), http.StatusBadRequest)
			return
		}

		s.mu.Lock()
		s.seenIDs[msg.ID]++
		seenCount := s.seenIDs[msg.ID]
		if seenCount == 1 {
			s.history = append(s.history, msg)
		}
		s.mu.Unlock()

		if seenCount > 1 {
			s.logger.Info("demo notification duplicate delivery recognized, suppressed duplicate effect",
				"notification_id", msg.ID,
				"ticket_id", msg.TicketID,
				"public_number", msg.PublicNumber,
				"duplicate_count", seenCount,
			)
		} else {
			s.logger.Info("demo notification delivered",
				"notification_id", msg.ID,
				"ticket_id", msg.TicketID,
				"public_number", msg.PublicNumber,
				"window_number", msg.WindowNumber,
				"duplicate_count", seenCount,
			)
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"status":          "delivered",
			"id":              msg.ID,
			"duplicate_count": seenCount,
		})
	}
}

func (s *DemoServer) handleMode(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		Mode DemoMode `json:"mode"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	switch body.Mode {
	case DemoModeSuccess, DemoModeFail, DemoModeTimeout:
		s.SetMode(body.Mode)
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"status": "ok",
			"mode":   body.Mode,
		})
	default:
		http.Error(w, "mode must be SUCCESS, FAIL or TIMEOUT", http.StatusBadRequest)
	}
}

func (s *DemoServer) handleHistory(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"items": s.History(),
		"total": len(s.history),
	})
}

func (s *DemoServer) handleReset(w http.ResponseWriter, r *http.Request) {
	s.Reset()
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "reset"})
}
