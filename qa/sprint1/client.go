package sprint1qa

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

// Frozen demo IDs mandated by Sprint #1 Shared Contracts
const (
	DemoBranchID      = "11111111-1111-1111-1111-111111111111"
	ParcelsServiceID  = "22222222-2222-2222-2222-222222222222"
	PaymentsServiceID = "55555555-5555-5555-5555-555555555555"
	Window1ID         = "33333333-3333-3333-3333-333333333333"
	Window2ID         = "44444444-4444-4444-4444-444444444444"
	Window3ID         = "66666666-6666-6666-6666-666666666666"
)

// Exact Frozen DTOs - Branches
type BranchDTO struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type BranchesResponse struct {
	Items []BranchDTO `json:"items"`
}

// Exact Frozen DTOs - Services
type ServiceDTO struct {
	ID   string `json:"id"`
	Code string `json:"code"`
	Name string `json:"name"`
}

type ServicesResponse struct {
	Items []ServiceDTO `json:"items"`
}

// Window Reference in Ticket DTO
type WindowRefDTO struct {
	ID     string `json:"id"`
	Number int    `json:"number"`
}

// Exact Ticket DTO
type TicketDTO struct {
	ID               string        `json:"id"`
	PublicNumber     string        `json:"publicNumber"`
	BranchID         string        `json:"branchId"`
	ServiceID        string        `json:"serviceId"`
	Source           string        `json:"source"`
	Status           string        `json:"status"`
	Window           *WindowRefDTO `json:"window"`
	CreatedAt        string        `json:"createdAt"`
	QueueEnteredAt   string        `json:"queueEnteredAt"`
	CalledAt         *string       `json:"calledAt"`
	ServiceStartedAt *string       `json:"serviceStartedAt"`
	CompletedAt      *string       `json:"completedAt"`
}

// Window DTO
type WindowDTO struct {
	ID       string       `json:"id"`
	Number   int          `json:"number"`
	Status   string       `json:"status"`
	Services []ServiceDTO `json:"services"`
}

// Error DTO
type ErrorDetail struct {
	Code      string `json:"code"`
	Message   string `json:"message"`
	RequestID string `json:"requestId"`
}

type ErrorResponse struct {
	Error ErrorDetail `json:"error"`
}

func (e ErrorResponse) String() string {
	return fmt.Sprintf("[%s] %s (requestId=%s)", e.Error.Code, e.Error.Message, e.Error.RequestID)
}

// Client is a pure black-box HTTP client for the frozen Sprint #1 API.
type Client struct {
	BaseURL    string
	HTTPClient *http.Client
}

// NewClient initializes the client with configurable BaseURL.
func NewClient(baseURL string) *Client {
	if baseURL == "" {
		baseURL = os.Getenv("BASE_URL")
	}
	if baseURL == "" {
		baseURL = "http://localhost:8080"
	}
	baseURL = strings.TrimRight(baseURL, "/")

	return &Client{
		BaseURL: baseURL,
		HTTPClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

type APIResponse[T any] struct {
	StatusCode int
	Data       *T
	ErrorData  *ErrorResponse
	RawBody    []byte
}

func (c *Client) doRequest(ctx context.Context, method, path string, headers map[string]string, body any, target any) (*APIResponse[any], error) {
	var bodyReader io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal request body: %w", err)
		}
		bodyReader = bytes.NewReader(b)
	}

	req, err := http.NewRequestWithContext(ctx, method, c.BaseURL+path, bodyReader)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("HTTP request failed (%s %s): %w", method, path, err)
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response body: %w", err)
	}

	apiResp := &APIResponse[any]{
		StatusCode: resp.StatusCode,
		RawBody:    raw,
	}

	if resp.StatusCode >= 400 {
		var errResp ErrorResponse
		if err := json.Unmarshal(raw, &errResp); err == nil && errResp.Error.Code != "" {
			apiResp.ErrorData = &errResp
		}
		return apiResp, nil
	}

	if target != nil && len(raw) > 0 && resp.StatusCode != http.StatusNoContent {
		if err := json.Unmarshal(raw, target); err != nil {
			return nil, fmt.Errorf("failed to decode response JSON into %T (status %d, raw: %s): %w", target, resp.StatusCode, string(raw), err)
		}
	}

	return apiResp, nil
}

// Health & Readiness checks
func (c *Client) GetHealth(ctx context.Context) (int, map[string]string, error) {
	var body map[string]string
	resp, err := c.doRequest(ctx, http.MethodGet, "/health", nil, nil, &body)
	if err != nil {
		return 0, nil, err
	}
	return resp.StatusCode, body, nil
}

func (c *Client) GetReady(ctx context.Context) (int, map[string]string, error) {
	var body map[string]string
	resp, err := c.doRequest(ctx, http.MethodGet, "/ready", nil, nil, &body)
	if err != nil {
		return 0, nil, err
	}
	return resp.StatusCode, body, nil
}

// GET /api/v1/branches
func (c *Client) ListBranches(ctx context.Context) (*BranchesResponse, int, error) {
	var res BranchesResponse
	resp, err := c.doRequest(ctx, http.MethodGet, "/api/v1/branches", nil, nil, &res)
	if err != nil {
		return nil, 0, err
	}
	if resp.StatusCode >= 400 {
		return nil, resp.StatusCode, fmt.Errorf("list branches failed with status %d: %s", resp.StatusCode, string(resp.RawBody))
	}
	return &res, resp.StatusCode, nil
}

// GET /api/v1/branches/{branchId}/services
func (c *Client) ListBranchServices(ctx context.Context, branchID string) (*ServicesResponse, int, error) {
	var res ServicesResponse
	path := fmt.Sprintf("/api/v1/branches/%s/services", branchID)
	resp, err := c.doRequest(ctx, http.MethodGet, path, nil, nil, &res)
	if err != nil {
		return nil, 0, err
	}
	if resp.StatusCode >= 400 {
		return nil, resp.StatusCode, fmt.Errorf("list branch services failed with status %d: %s", resp.StatusCode, string(resp.RawBody))
	}
	return &res, resp.StatusCode, nil
}

// GET /api/v1/operator/branches/{branchId}/windows
func (c *Client) ListBranchWindows(ctx context.Context, branchID string) ([]WindowDTO, int, error) {
	var res []WindowDTO
	path := fmt.Sprintf("/api/v1/operator/branches/%s/windows", branchID)
	resp, err := c.doRequest(ctx, http.MethodGet, path, nil, nil, &res)
	if err != nil {
		return nil, 0, err
	}
	if resp.StatusCode >= 400 {
		return nil, resp.StatusCode, fmt.Errorf("list branch windows failed with status %d: %s", resp.StatusCode, string(resp.RawBody))
	}
	return res, resp.StatusCode, nil
}

// POST /api/v1/branches/{branchId}/tickets/qr
func (c *Client) CreateQRTicket(ctx context.Context, branchID, serviceID, idempotencyKey string) (*TicketDTO, *ErrorResponse, int, error) {
	path := fmt.Sprintf("/api/v1/branches/%s/tickets/qr", branchID)
	headers := make(map[string]string)
	if idempotencyKey != "" {
		headers["Idempotency-Key"] = idempotencyKey
	}
	body := map[string]string{"serviceId": serviceID}

	var ticket TicketDTO
	resp, err := c.doRequest(ctx, http.MethodPost, path, headers, body, &ticket)
	if err != nil {
		return nil, nil, 0, err
	}
	if resp.StatusCode >= 400 {
		return nil, resp.ErrorData, resp.StatusCode, nil
	}
	return &ticket, nil, resp.StatusCode, nil
}

// GET /api/v1/tickets/{ticketId}
func (c *Client) GetTicket(ctx context.Context, ticketID string) (*TicketDTO, *ErrorResponse, int, error) {
	path := fmt.Sprintf("/api/v1/tickets/%s", ticketID)
	var ticket TicketDTO
	resp, err := c.doRequest(ctx, http.MethodGet, path, nil, nil, &ticket)
	if err != nil {
		return nil, nil, 0, err
	}
	if resp.StatusCode >= 400 {
		return nil, resp.ErrorData, resp.StatusCode, nil
	}
	return &ticket, nil, resp.StatusCode, nil
}

// GET /api/v1/operator/windows/{windowId}/current-ticket
// Returns:
// 200: (*TicketDTO, nil, 200, nil)
// 204: (nil, nil, 204, nil)
// 404: (nil, *ErrorResponse, 404, nil)
func (c *Client) GetCurrentTicket(ctx context.Context, windowID string) (*TicketDTO, *ErrorResponse, int, error) {
	path := fmt.Sprintf("/api/v1/operator/windows/%s/current-ticket", windowID)
	var ticket TicketDTO
	resp, err := c.doRequest(ctx, http.MethodGet, path, nil, nil, &ticket)
	if err != nil {
		return nil, nil, 0, err
	}
	if resp.StatusCode == http.StatusNoContent {
		return nil, nil, http.StatusNoContent, nil
	}
	if resp.StatusCode >= 400 {
		return nil, resp.ErrorData, resp.StatusCode, nil
	}
	return &ticket, nil, resp.StatusCode, nil
}

// POST /api/v1/operator/windows/{windowId}/call-next
func (c *Client) CallNext(ctx context.Context, windowID string) (*TicketDTO, *ErrorResponse, int, error) {
	path := fmt.Sprintf("/api/v1/operator/windows/%s/call-next", windowID)
	var ticket TicketDTO
	resp, err := c.doRequest(ctx, http.MethodPost, path, nil, nil, &ticket)
	if err != nil {
		return nil, nil, 0, err
	}
	if resp.StatusCode >= 400 {
		return nil, resp.ErrorData, resp.StatusCode, nil
	}
	return &ticket, nil, resp.StatusCode, nil
}

// POST /api/v1/operator/tickets/{ticketId}/start
func (c *Client) StartService(ctx context.Context, ticketID string) (*TicketDTO, *ErrorResponse, int, error) {
	path := fmt.Sprintf("/api/v1/operator/tickets/%s/start", ticketID)
	var ticket TicketDTO
	resp, err := c.doRequest(ctx, http.MethodPost, path, nil, nil, &ticket)
	if err != nil {
		return nil, nil, 0, err
	}
	if resp.StatusCode >= 400 {
		return nil, resp.ErrorData, resp.StatusCode, nil
	}
	return &ticket, nil, resp.StatusCode, nil
}

// POST /api/v1/operator/tickets/{ticketId}/complete
func (c *Client) CompleteService(ctx context.Context, ticketID string) (*TicketDTO, *ErrorResponse, int, error) {
	path := fmt.Sprintf("/api/v1/operator/tickets/%s/complete", ticketID)
	var ticket TicketDTO
	resp, err := c.doRequest(ctx, http.MethodPost, path, nil, nil, &ticket)
	if err != nil {
		return nil, nil, 0, err
	}
	if resp.StatusCode >= 400 {
		return nil, resp.ErrorData, resp.StatusCode, nil
	}
	return &ticket, nil, resp.StatusCode, nil
}
