package sprint2qa

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

// Frozen demo IDs mandated by Sprint #1 & #2 Shared Contracts
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

type WindowsResponse struct {
	Items []WindowDTO `json:"items"`
}

// Appointment Response DTO
type AppointmentResponseDTO struct {
	Ticket      TicketDTO `json:"ticket"`
	ScheduledAt string    `json:"scheduledAt"`
}

// Queue Policy DTO
type QueuePolicyDTO struct {
	BranchID               string `json:"branchId"`
	AppointmentDuePriority int    `json:"appointmentDuePriority"`
	QRPriority             int    `json:"qrPriority"`
	Version                int64  `json:"version"`
	UpdatedAt              string `json:"updatedAt"`
}

type UpdateQueuePolicyRequest struct {
	AppointmentDuePriority int   `json:"appointmentDuePriority"`
	QRPriority             int   `json:"qrPriority"`
	ExpectedVersion        int64 `json:"expectedVersion"`
}

// Ticket Event DTO
type TicketEventDTO struct {
	ID               int64   `json:"id"`
	Type             string  `json:"type"`
	FromStatus       *string `json:"fromStatus"`
	ToStatus         string  `json:"toStatus"`
	WindowID         *string `json:"windowId"`
	PolicyVersion    *int64  `json:"policyVersion"`
	DecisionPriority *int    `json:"decisionPriority"`
	OccurredAt       string  `json:"occurredAt"`
}

type TicketEventsResponseDTO struct {
	Items []TicketEventDTO `json:"items"`
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

// Client is a pure black-box HTTP client for the frozen Sprint #1 & #2 API.
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
	return &Client{
		BaseURL: strings.TrimRight(baseURL, "/"),
		HTTPClient: &http.Client{
			Timeout: 10 * time.Second,
			Transport: sessionTransport{},
		},
	}
}

// Foundation Endpoints
func (c *Client) GetHealth(ctx context.Context) (int, map[string]any, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.BaseURL+"/health", nil)
	if err != nil {
		return 0, nil, err
	}
	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return 0, nil, err
	}
	defer resp.Body.Close()

	var body map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&body)
	return resp.StatusCode, body, nil
}

func (c *Client) GetReady(ctx context.Context) (int, map[string]any, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.BaseURL+"/ready", nil)
	if err != nil {
		return 0, nil, err
	}
	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return 0, nil, err
	}
	defer resp.Body.Close()

	var body map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&body)
	return resp.StatusCode, body, nil
}

// Catalog Endpoints
func (c *Client) ListBranches(ctx context.Context) (*BranchesResponse, *ErrorResponse, int, error) {
	url := fmt.Sprintf("%s/api/v1/branches", c.BaseURL)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, nil, 0, err
	}
	return executeRequest[BranchesResponse](c.HTTPClient, req)
}

func (c *Client) ListServices(ctx context.Context, branchID string) (*ServicesResponse, *ErrorResponse, int, error) {
	url := fmt.Sprintf("%s/api/v1/branches/%s/services", c.BaseURL, branchID)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, nil, 0, err
	}
	return executeRequest[ServicesResponse](c.HTTPClient, req)
}

// Ticket & Queue Endpoints
func (c *Client) CreateQRTicket(ctx context.Context, branchID, serviceID, idempotencyKey string) (*TicketDTO, *ErrorResponse, int, error) {
	url := fmt.Sprintf("%s/api/v1/branches/%s/tickets/qr", c.BaseURL, branchID)
	payload := map[string]string{"serviceId": serviceID}
	data, _ := json.Marshal(payload)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(data))
	if err != nil {
		return nil, nil, 0, err
	}
	req.Header.Set("Content-Type", "application/json")
	if idempotencyKey != "" {
		req.Header.Set("Idempotency-Key", idempotencyKey)
	}
	return executeRequest[TicketDTO](c.HTTPClient, req)
}

func (c *Client) GetTicket(ctx context.Context, ticketID string) (*TicketDTO, *ErrorResponse, int, error) {
	url := fmt.Sprintf("%s/api/v1/tickets/%s", c.BaseURL, ticketID)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, nil, 0, err
	}
	return executeRequest[TicketDTO](c.HTTPClient, req)
}

// Operator Endpoints
func (c *Client) ListWindows(ctx context.Context, branchID string) (*WindowsResponse, *ErrorResponse, int, error) {
	url := fmt.Sprintf("%s/api/v1/operator/branches/%s/windows", c.BaseURL, branchID)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, nil, 0, err
	}
	return executeRequest[WindowsResponse](c.HTTPClient, req)
}

func (c *Client) GetCurrentTicket(ctx context.Context, windowID string) (*TicketDTO, *ErrorResponse, int, error) {
	url := fmt.Sprintf("%s/api/v1/operator/windows/%s/current-ticket", c.BaseURL, windowID)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, nil, 0, err
	}
	return executeRequest[TicketDTO](c.HTTPClient, req)
}

func (c *Client) CallNext(ctx context.Context, windowID string) (*TicketDTO, *ErrorResponse, int, error) {
	url := fmt.Sprintf("%s/api/v1/operator/windows/%s/call-next", c.BaseURL, windowID)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, nil)
	if err != nil {
		return nil, nil, 0, err
	}
	return executeRequest[TicketDTO](c.HTTPClient, req)
}

func (c *Client) StartService(ctx context.Context, ticketID string) (*TicketDTO, *ErrorResponse, int, error) {
	url := fmt.Sprintf("%s/api/v1/operator/tickets/%s/start", c.BaseURL, ticketID)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, nil)
	if err != nil {
		return nil, nil, 0, err
	}
	return executeRequest[TicketDTO](c.HTTPClient, req)
}

func (c *Client) CompleteService(ctx context.Context, ticketID string) (*TicketDTO, *ErrorResponse, int, error) {
	url := fmt.Sprintf("%s/api/v1/operator/tickets/%s/complete", c.BaseURL, ticketID)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, nil)
	if err != nil {
		return nil, nil, 0, err
	}
	return executeRequest[TicketDTO](c.HTTPClient, req)
}

// Sprint #2: Appointment Endpoints
func (c *Client) CreateAppointment(ctx context.Context, branchID, serviceID, scheduledAt, idempotencyKey string) (*AppointmentResponseDTO, *ErrorResponse, int, error) {
	url := fmt.Sprintf("%s/api/v1/appointments", c.BaseURL)
	payload := map[string]string{
		"branchId":    branchID,
		"serviceId":   serviceID,
		"scheduledAt": scheduledAt,
	}
	data, _ := json.Marshal(payload)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(data))
	if err != nil {
		return nil, nil, 0, err
	}
	req.Header.Set("Content-Type", "application/json")
	if idempotencyKey != "" {
		req.Header.Set("Idempotency-Key", idempotencyKey)
	}
	return executeRequest[AppointmentResponseDTO](c.HTTPClient, req)
}

func (c *Client) CancelAppointment(ctx context.Context, ticketID string) (*AppointmentResponseDTO, *ErrorResponse, int, error) {
	url := fmt.Sprintf("%s/api/v1/appointments/%s/cancel", c.BaseURL, ticketID)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, nil)
	if err != nil {
		return nil, nil, 0, err
	}
	return executeRequest[AppointmentResponseDTO](c.HTTPClient, req)
}

// Sprint #2: Queue Policy Endpoints
func (c *Client) GetQueuePolicy(ctx context.Context, branchID string) (*QueuePolicyDTO, *ErrorResponse, int, error) {
	url := fmt.Sprintf("%s/api/v1/admin/branches/%s/queue-policy", c.BaseURL, branchID)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, nil, 0, err
	}
	return executeRequest[QueuePolicyDTO](c.HTTPClient, req)
}

func (c *Client) UpdateQueuePolicy(ctx context.Context, branchID string, reqBody UpdateQueuePolicyRequest) (*QueuePolicyDTO, *ErrorResponse, int, error) {
	url := fmt.Sprintf("%s/api/v1/admin/branches/%s/queue-policy", c.BaseURL, branchID)
	data, _ := json.Marshal(reqBody)

	req, err := http.NewRequestWithContext(ctx, http.MethodPut, url, bytes.NewReader(data))
	if err != nil {
		return nil, nil, 0, err
	}
	req.Header.Set("Content-Type", "application/json")
	return executeRequest[QueuePolicyDTO](c.HTTPClient, req)
}

// Sprint #2: Ticket Events Audit Log Endpoints
func (c *Client) ListTicketEvents(ctx context.Context, ticketID string) (*TicketEventsResponseDTO, *ErrorResponse, int, error) {
	url := fmt.Sprintf("%s/api/v1/admin/tickets/%s/events", c.BaseURL, ticketID)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, nil, 0, err
	}
	return executeRequest[TicketEventsResponseDTO](c.HTTPClient, req)
}

// executeRequest performs HTTP request and unmarshals success or error response.
func executeRequest[T any](httpClient *http.Client, req *http.Request) (*T, *ErrorResponse, int, error) {
	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, nil, 0, fmt.Errorf("HTTP request failed: %w", err)
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, nil, resp.StatusCode, fmt.Errorf("failed to read response body: %w", err)
	}

	if resp.StatusCode == http.StatusOK || resp.StatusCode == http.StatusCreated {
		var result T
		if len(bodyBytes) > 0 {
			if err := json.Unmarshal(bodyBytes, &result); err != nil {
				return nil, nil, resp.StatusCode, fmt.Errorf("failed to unmarshal success response (status %d, body: %s): %w", resp.StatusCode, string(bodyBytes), err)
			}
		}
		return &result, nil, resp.StatusCode, nil
	}

	if resp.StatusCode == http.StatusNoContent {
		return nil, nil, resp.StatusCode, nil
	}

	var errResp ErrorResponse
	if err := json.Unmarshal(bodyBytes, &errResp); err != nil {
		return nil, nil, resp.StatusCode, fmt.Errorf("non-success status %d, could not unmarshal error response (body: %s): %w", resp.StatusCode, string(bodyBytes), err)
	}
	return nil, &errResp, resp.StatusCode, nil
}
