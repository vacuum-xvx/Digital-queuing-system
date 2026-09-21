package notification

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"postcode/backend/internal/domain"
)

// NotificationSender delivers messages to external providers (e.g. demo adapter, SMS, push).
type NotificationSender interface {
	Send(ctx context.Context, msg domain.NotificationMessage) error
}

// HTTPSender sends notifications to a configured HTTP endpoint.
type HTTPSender struct {
	client  *http.Client
	url     string
	timeout time.Duration
}

func NewHTTPSender(url string, timeout time.Duration) *HTTPSender {
	if timeout <= 0 {
		timeout = 3 * time.Second
	}
	return &HTTPSender{
		url:     url,
		timeout: timeout,
		client: &http.Client{
			Timeout: timeout,
		},
	}
}

func (s *HTTPSender) Send(ctx context.Context, msg domain.NotificationMessage) error {
	if s.url == "" {
		return fmt.Errorf("notification provider URL is not configured")
	}

	body, err := json.Marshal(msg)
	if err != nil {
		return fmt.Errorf("marshal notification: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.url, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Idempotency-Key", msg.ID)
	req.Header.Set("X-Notification-ID", msg.ID)

	resp, err := s.client.Do(req)
	if err != nil {
		return fmt.Errorf("notification provider request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("notification provider returned HTTP %d", resp.StatusCode)
	}

	return nil
}
