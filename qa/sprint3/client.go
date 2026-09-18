package sprint3qa

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

// Frozen demo IDs mandated by Sprint #1, #2 & #3 Shared Contracts
const (
	DemoBranchID      = "11111111-1111-1111-1111-111111111111"
	ParcelsServiceID  = "22222222-2222-2222-2222-222222222222"
	PaymentsServiceID = "55555555-5555-5555-5555-555555555555"
	Window1ID         = "33333333-3333-3333-3333-333333333333"
	Window2ID         = "44444444-4444-4444-4444-444444444444"
	Window3ID         = "66666666-6666-6666-6666-666666666666"
)

// Branches
type BranchDTO struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type BranchesResponse struct {
	Items []BranchDTO `json:"items"`
}

// Services
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

// Exact Ticket DTO (Shared Contracts: do not add arrivedAt, noShowAt, scheduledAt to common Ticket)
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

// Sprint 3 Queue Policy DTO (All 8 frozen fields + version + branchId + updatedAt)
type QueuePolicyDTO struct {
	BranchID                        string `json:"branchId"`
	AppointmentDuePriority          int    `json:"appointmentDuePriority"`
	QRPriority                      int    `json:"qrPriority"`
	LivePriority                    int    `json:"livePriority"`
	AntiStarvationThresholdMinutes  int    `json:"antiStarvationThresholdMinutes"`
	AntiStarvationPointsPerMinute   int    `json:"antiStarvationPointsPerMinute"`
	AppointmentGraceMinutes         int    `json:"appointmentGraceMinutes"`
	AppointmentLatePenaltyPerMinute int    `json:"appointmentLatePenaltyPerMinute"`
	AppointmentLatePenaltyMaxPoints int    `json:"appointmentLatePenaltyMaxPoints"`
	Version                         int64  `json:"version"`
	UpdatedAt                       string `json:"updatedAt"`
}

type UpdateQueuePolicyRequest struct {
	AppointmentDuePriority          int   `json:"appointmentDuePriority"`
	QRPriority                      int   `json:"qrPriority"`
	LivePriority                    *int  `json:"livePriority,omitempty"`
	AntiStarvationThresholdMinutes  *int  `json:"antiStarvationThresholdMinutes,omitempty"`
	AntiStarvationPointsPerMinute   *int  `json:"antiStarvationPointsPerMinute,omitempty"`
	AppointmentGraceMinutes         *int  `json:"appointmentGraceMinutes,omitempty"`
	AppointmentLatePenaltyPerMinute *int  `json:"appointmentLatePenaltyPerMinute,omitempty"`
	AppointmentLatePenaltyMaxPoints *int  `json:"appointmentLatePenaltyMaxPoints,omitempty"`
	ExpectedVersion                 int64 `json:"expectedVersion"`
}

// Sprint 3 Queue Position DTO
type QueuePositionDTO struct {
	TicketID           string        `json:"ticketId"`
	TicketStatus       string        `json:"ticketStatus"`
	Reason             string        `json:"reason"`
	Position           *int          `json:"position"`
	ReferenceWindow    *WindowRefDTO `json:"referenceWindow"`
	CalculatedAt       string        `json:"calculatedAt"`
	EffectivePriority  *int64        `json:"effectivePriority"`
	EffectiveQueueTime *string       `json:"effectiveQueueTime"`
}

// Ticket Events
type TicketEventDTO struct {
	ID               int64     `json:"id"`
	Type             string    `json:"type"`
	FromStatus       *string   `json:"fromStatus"`
	ToStatus         string    `json:"toStatus"`
	WindowID         *string   `json:"windowId"`
	PolicyVersion    *int64    `json:"policyVersion"`
	DecisionPriority *int64    `json:"decisionPriority"`
	OccurredAt       time.Time `json:"occurredAt"`
}

type TicketEventsResponse struct {
	Items []TicketEventDTO `json:"items"`
}

// Error Envelope
type ErrorDetail struct {
	Code      string `json:"code"`
	Message   string `json:"message"`
	RequestID string `json:"requestId"`
}

type ErrorResponse struct {
	Error ErrorDetail `json:"error"`
}

// Client implements pure black-box HTTP calls to the Electronic Queue API
type Client struct {
	baseURL    string
	httpClient *http.Client
}

func NewClient(baseURL string) *Client {
	if baseURL == "" {
		baseURL = os.Getenv("BASE_URL")
		if baseURL == "" {
			baseURL = "http://localhost:8080"
		}
	}
	baseURL = strings.TrimRight(baseURL, "/")

	return &Client{
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
			Transport: sessionTransport{},
		},
	}
}

// BaseURL returns the configured base URL.
func (c *Client) BaseURL() string {
	return c.baseURL
}

func (c *Client) do(req *http.Request) (*http.Response, []byte, error) {
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return resp, nil, err
	}
	return resp, body, nil
}

// Health checks /health
func (c *Client) Health(ctx context.Context) (int, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/health", nil)
	if err != nil {
		return 0, err
	}
	resp, _, err := c.do(req)
	if err != nil {
		return 0, err
	}
	return resp.StatusCode, nil
}

// Ready checks /ready
func (c *Client) Ready(ctx context.Context) (int, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/ready", nil)
	if err != nil {
		return 0, err
	}
	resp, _, err := c.do(req)
	if err != nil {
		return 0, err
	}
	return resp.StatusCode, nil
}

// ListBranches: GET /api/v1/branches
func (c *Client) ListBranches(ctx context.Context) (*BranchesResponse, *ErrorResponse, int, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/api/v1/branches", nil)
	if err != nil {
		return nil, nil, 0, err
	}
	resp, body, err := c.do(req)
	if err != nil {
		return nil, nil, 0, err
	}
	if resp.StatusCode == http.StatusOK {
		var res BranchesResponse
		if err := json.Unmarshal(body, &res); err != nil {
			return nil, nil, resp.StatusCode, err
		}
		return &res, nil, resp.StatusCode, nil
	}
	var errRes ErrorResponse
	_ = json.Unmarshal(body, &errRes)
	return nil, &errRes, resp.StatusCode, nil
}

// ListBranchServices: GET /api/v1/branches/{branchId}/services
func (c *Client) ListBranchServices(ctx context.Context, branchID string) (*ServicesResponse, *ErrorResponse, int, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, fmt.Sprintf("%s/api/v1/branches/%s/services", c.baseURL, branchID), nil)
	if err != nil {
		return nil, nil, 0, err
	}
	resp, body, err := c.do(req)
	if err != nil {
		return nil, nil, 0, err
	}
	if resp.StatusCode == http.StatusOK {
		var res ServicesResponse
		if err := json.Unmarshal(body, &res); err != nil {
			return nil, nil, resp.StatusCode, err
		}
		return &res, nil, resp.StatusCode, nil
	}
	var errRes ErrorResponse
	_ = json.Unmarshal(body, &errRes)
	return nil, &errRes, resp.StatusCode, nil
}

// CreateLiveTicket: POST /api/v1/operator/branches/{branchId}/tickets/live (with fallback to /api/v1/branches/{branchId}/tickets/live)
func (c *Client) CreateLiveTicket(ctx context.Context, branchID, serviceID, idempotencyKey string) (*TicketDTO, *ErrorResponse, int, error) {
	payload := map[string]string{"serviceId": serviceID}
	data, _ := json.Marshal(payload)

	// Primary contract endpoint: /api/v1/operator/branches/{branchId}/tickets/live
	primaryURL := fmt.Sprintf("%s/api/v1/operator/branches/%s/tickets/live", c.baseURL, branchID)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, primaryURL, bytes.NewReader(data))
	if err != nil {
		return nil, nil, 0, err
	}
	req.Header.Set("Content-Type", "application/json")
	if idempotencyKey != "" {
		req.Header.Set("Idempotency-Key", idempotencyKey)
	}

	resp, body, err := c.do(req)
	if err != nil {
		return nil, nil, 0, err
	}

	// If operator path not yet wired, try baseline client path
	if resp.StatusCode == http.StatusNotFound {
		fallbackURL := fmt.Sprintf("%s/api/v1/branches/%s/tickets/live", c.baseURL, branchID)
		fReq, fErr := http.NewRequestWithContext(ctx, http.MethodPost, fallbackURL, bytes.NewReader(data))
		if fErr == nil {
			fReq.Header.Set("Content-Type", "application/json")
			if idempotencyKey != "" {
				fReq.Header.Set("Idempotency-Key", idempotencyKey)
			}
			fResp, fBody, fDoErr := c.do(fReq)
			if fDoErr == nil && fResp.StatusCode != http.StatusNotFound {
				resp = fResp
				body = fBody
			}
		}
	}

	if resp.StatusCode == http.StatusCreated || resp.StatusCode == http.StatusOK {
		var ticket TicketDTO
		if err := json.Unmarshal(body, &ticket); err != nil {
			return nil, nil, resp.StatusCode, err
		}
		return &ticket, nil, resp.StatusCode, nil
	}

	var errRes ErrorResponse
	_ = json.Unmarshal(body, &errRes)
	return nil, &errRes, resp.StatusCode, nil
}

// ArriveAppointment: POST /api/v1/appointments/{ticketId}/arrive
func (c *Client) ArriveAppointment(ctx context.Context, ticketID string) (*ErrorResponse, int, error) {
	u := fmt.Sprintf("%s/api/v1/appointments/%s/arrive", c.baseURL, ticketID)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, u, nil)
	if err != nil {
		return nil, 0, err
	}

	resp, body, err := c.do(req)
	if err != nil {
		return nil, 0, err
	}

	if resp.StatusCode == http.StatusOK || resp.StatusCode == http.StatusNoContent {
		return nil, resp.StatusCode, nil
	}

	var errRes ErrorResponse
	_ = json.Unmarshal(body, &errRes)
	return &errRes, resp.StatusCode, nil
}

// MarkNoShow: POST /api/v1/operator/tickets/{ticketId}/no-show
func (c *Client) MarkNoShow(ctx context.Context, ticketID string) (*ErrorResponse, int, error) {
	u := fmt.Sprintf("%s/api/v1/operator/tickets/%s/no-show", c.baseURL, ticketID)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, u, nil)
	if err != nil {
		return nil, 0, err
	}

	resp, body, err := c.do(req)
	if err != nil {
		return nil, 0, err
	}

	if resp.StatusCode == http.StatusOK || resp.StatusCode == http.StatusNoContent {
		return nil, resp.StatusCode, nil
	}

	var errRes ErrorResponse
	_ = json.Unmarshal(body, &errRes)
	return &errRes, resp.StatusCode, nil
}

// GetQueuePosition: GET /api/v1/tickets/{ticketId}/position
func (c *Client) GetQueuePosition(ctx context.Context, ticketID string) (*QueuePositionDTO, *ErrorResponse, int, error) {
	u := fmt.Sprintf("%s/api/v1/tickets/%s/position", c.baseURL, ticketID)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, nil, 0, err
	}

	resp, body, err := c.do(req)
	if err != nil {
		return nil, nil, 0, err
	}

	if resp.StatusCode == http.StatusOK {
		var pos QueuePositionDTO
		if err := json.Unmarshal(body, &pos); err != nil {
			return nil, nil, resp.StatusCode, err
		}
		return &pos, nil, resp.StatusCode, nil
	}

	var errRes ErrorResponse
	_ = json.Unmarshal(body, &errRes)
	return nil, &errRes, resp.StatusCode, nil
}

// CreateQRTicket: POST /api/v1/branches/{branchId}/tickets/qr
func (c *Client) CreateQRTicket(ctx context.Context, branchID, serviceID, idempotencyKey string) (*TicketDTO, *ErrorResponse, int, error) {
	payload := map[string]string{"serviceId": serviceID}
	data, _ := json.Marshal(payload)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, fmt.Sprintf("%s/api/v1/branches/%s/tickets/qr", c.baseURL, branchID), bytes.NewReader(data))
	if err != nil {
		return nil, nil, 0, err
	}
	req.Header.Set("Content-Type", "application/json")
	if idempotencyKey != "" {
		req.Header.Set("Idempotency-Key", idempotencyKey)
	}

	resp, body, err := c.do(req)
	if err != nil {
		return nil, nil, 0, err
	}

	if resp.StatusCode == http.StatusCreated || resp.StatusCode == http.StatusOK {
		var ticket TicketDTO
		if err := json.Unmarshal(body, &ticket); err != nil {
			return nil, nil, resp.StatusCode, err
		}
		return &ticket, nil, resp.StatusCode, nil
	}

	var errRes ErrorResponse
	_ = json.Unmarshal(body, &errRes)
	return nil, &errRes, resp.StatusCode, nil
}

// CreateAppointment: POST /api/v1/branches/{branchId}/tickets/appointment
func (c *Client) CreateAppointment(ctx context.Context, branchID, serviceID, idempotencyKey, scheduledAt string) (*AppointmentResponseDTO, *ErrorResponse, int, error) {
	payload := map[string]string{
		"serviceId":   serviceID,
		"scheduledAt": scheduledAt,
	}
	data, _ := json.Marshal(payload)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, fmt.Sprintf("%s/api/v1/branches/%s/tickets/appointment", c.baseURL, branchID), bytes.NewReader(data))
	if err != nil {
		return nil, nil, 0, err
	}
	req.Header.Set("Content-Type", "application/json")
	if idempotencyKey != "" {
		req.Header.Set("Idempotency-Key", idempotencyKey)
	}

	resp, body, err := c.do(req)
	if err != nil {
		return nil, nil, 0, err
	}

	if resp.StatusCode == http.StatusCreated || resp.StatusCode == http.StatusOK {
		var res AppointmentResponseDTO
		if err := json.Unmarshal(body, &res); err != nil {
			return nil, nil, resp.StatusCode, err
		}
		return &res, nil, resp.StatusCode, nil
	}

	var errRes ErrorResponse
	_ = json.Unmarshal(body, &errRes)
	return nil, &errRes, resp.StatusCode, nil
}

// CancelAppointment: POST /api/v1/appointments/{ticketId}/cancel
func (c *Client) CancelAppointment(ctx context.Context, ticketID string) (*ErrorResponse, int, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, fmt.Sprintf("%s/api/v1/appointments/%s/cancel", c.baseURL, ticketID), nil)
	if err != nil {
		return nil, 0, err
	}

	resp, body, err := c.do(req)
	if err != nil {
		return nil, 0, err
	}

	if resp.StatusCode == http.StatusOK || resp.StatusCode == http.StatusNoContent {
		return nil, resp.StatusCode, nil
	}

	var errRes ErrorResponse
	_ = json.Unmarshal(body, &errRes)
	return &errRes, resp.StatusCode, nil
}

// GetTicket: GET /api/v1/tickets/{ticketId}
func (c *Client) GetTicket(ctx context.Context, ticketID string) (*TicketDTO, *ErrorResponse, int, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, fmt.Sprintf("%s/api/v1/tickets/%s", c.baseURL, ticketID), nil)
	if err != nil {
		return nil, nil, 0, err
	}

	resp, body, err := c.do(req)
	if err != nil {
		return nil, nil, 0, err
	}

	if resp.StatusCode == http.StatusOK {
		var ticket TicketDTO
		if err := json.Unmarshal(body, &ticket); err != nil {
			return nil, nil, resp.StatusCode, err
		}
		return &ticket, nil, resp.StatusCode, nil
	}

	var errRes ErrorResponse
	_ = json.Unmarshal(body, &errRes)
	return nil, &errRes, resp.StatusCode, nil
}

// ListBranchWindows: GET /api/v1/operator/branches/{branchId}/windows
func (c *Client) ListBranchWindows(ctx context.Context, branchID string) (*WindowsResponse, *ErrorResponse, int, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, fmt.Sprintf("%s/api/v1/operator/branches/%s/windows", c.baseURL, branchID), nil)
	if err != nil {
		return nil, nil, 0, err
	}

	resp, body, err := c.do(req)
	if err != nil {
		return nil, nil, 0, err
	}

	if resp.StatusCode == http.StatusOK {
		var res WindowsResponse
		if err := json.Unmarshal(body, &res); err != nil {
			return nil, nil, resp.StatusCode, err
		}
		return &res, nil, resp.StatusCode, nil
	}

	var errRes ErrorResponse
	_ = json.Unmarshal(body, &errRes)
	return nil, &errRes, resp.StatusCode, nil
}

// GetCurrentTicket: GET /api/v1/operator/windows/{windowId}/current-ticket
func (c *Client) GetCurrentTicket(ctx context.Context, windowID string) (*TicketDTO, *ErrorResponse, int, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, fmt.Sprintf("%s/api/v1/operator/windows/%s/current-ticket", c.baseURL, windowID), nil)
	if err != nil {
		return nil, nil, 0, err
	}

	resp, body, err := c.do(req)
	if err != nil {
		return nil, nil, 0, err
	}

	if resp.StatusCode == http.StatusNoContent {
		return nil, nil, resp.StatusCode, nil
	}

	if resp.StatusCode == http.StatusOK {
		var ticket TicketDTO
		if err := json.Unmarshal(body, &ticket); err != nil {
			return nil, nil, resp.StatusCode, err
		}
		return &ticket, nil, resp.StatusCode, nil
	}

	var errRes ErrorResponse
	_ = json.Unmarshal(body, &errRes)
	return nil, &errRes, resp.StatusCode, nil
}

// CallNext: POST /api/v1/operator/windows/{windowId}/call-next
func (c *Client) CallNext(ctx context.Context, windowID string) (*TicketDTO, *ErrorResponse, int, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, fmt.Sprintf("%s/api/v1/operator/windows/%s/call-next", c.baseURL, windowID), nil)
	if err != nil {
		return nil, nil, 0, err
	}

	resp, body, err := c.do(req)
	if err != nil {
		return nil, nil, 0, err
	}

	if resp.StatusCode == http.StatusOK {
		var ticket TicketDTO
		if err := json.Unmarshal(body, &ticket); err != nil {
			return nil, nil, resp.StatusCode, err
		}
		return &ticket, nil, resp.StatusCode, nil
	}

	var errRes ErrorResponse
	_ = json.Unmarshal(body, &errRes)
	return nil, &errRes, resp.StatusCode, nil
}

// StartService: POST /api/v1/operator/tickets/{ticketId}/start
func (c *Client) StartService(ctx context.Context, ticketID string) (*TicketDTO, *ErrorResponse, int, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, fmt.Sprintf("%s/api/v1/operator/tickets/%s/start", c.baseURL, ticketID), nil)
	if err != nil {
		return nil, nil, 0, err
	}

	resp, body, err := c.do(req)
	if err != nil {
		return nil, nil, 0, err
	}

	if resp.StatusCode == http.StatusOK {
		var ticket TicketDTO
		if err := json.Unmarshal(body, &ticket); err != nil {
			return nil, nil, resp.StatusCode, err
		}
		return &ticket, nil, resp.StatusCode, nil
	}

	var errRes ErrorResponse
	_ = json.Unmarshal(body, &errRes)
	return nil, &errRes, resp.StatusCode, nil
}

// CompleteService: POST /api/v1/operator/tickets/{ticketId}/complete
func (c *Client) CompleteService(ctx context.Context, ticketID string) (*TicketDTO, *ErrorResponse, int, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, fmt.Sprintf("%s/api/v1/operator/tickets/%s/complete", c.baseURL, ticketID), nil)
	if err != nil {
		return nil, nil, 0, err
	}

	resp, body, err := c.do(req)
	if err != nil {
		return nil, nil, 0, err
	}

	if resp.StatusCode == http.StatusOK {
		var ticket TicketDTO
		if err := json.Unmarshal(body, &ticket); err != nil {
			return nil, nil, resp.StatusCode, err
		}
		return &ticket, nil, resp.StatusCode, nil
	}

	var errRes ErrorResponse
	_ = json.Unmarshal(body, &errRes)
	return nil, &errRes, resp.StatusCode, nil
}

// GetQueuePolicy: GET /api/v1/admin/branches/{branchId}/queue-policy
func (c *Client) GetQueuePolicy(ctx context.Context, branchID string) (*QueuePolicyDTO, *ErrorResponse, int, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, fmt.Sprintf("%s/api/v1/admin/branches/%s/queue-policy", c.baseURL, branchID), nil)
	if err != nil {
		return nil, nil, 0, err
	}

	resp, body, err := c.do(req)
	if err != nil {
		return nil, nil, 0, err
	}

	if resp.StatusCode == http.StatusOK {
		var policy QueuePolicyDTO
		if err := json.Unmarshal(body, &policy); err != nil {
			return nil, nil, resp.StatusCode, err
		}
		return &policy, nil, resp.StatusCode, nil
	}

	var errRes ErrorResponse
	_ = json.Unmarshal(body, &errRes)
	return nil, &errRes, resp.StatusCode, nil
}

// UpdateQueuePolicy: PUT /api/v1/admin/branches/{branchId}/queue-policy
func (c *Client) UpdateQueuePolicy(ctx context.Context, branchID string, req UpdateQueuePolicyRequest) (*QueuePolicyDTO, *ErrorResponse, int, error) {
	data, err := json.Marshal(req)
	if err != nil {
		return nil, nil, 0, err
	}
	return c.UpdateQueuePolicyRaw(ctx, branchID, data)
}

// UpdateQueuePolicyRaw allows sending custom/malformed or explicit null JSON bodies
func (c *Client) UpdateQueuePolicyRaw(ctx context.Context, branchID string, body []byte) (*QueuePolicyDTO, *ErrorResponse, int, error) {
	u := fmt.Sprintf("%s/api/v1/admin/branches/%s/queue-policy", c.baseURL, branchID)
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPut, u, bytes.NewReader(body))
	if err != nil {
		return nil, nil, 0, err
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, respBody, err := c.do(httpReq)
	if err != nil {
		return nil, nil, 0, err
	}

	if resp.StatusCode == http.StatusOK {
		var policy QueuePolicyDTO
		if err := json.Unmarshal(respBody, &policy); err != nil {
			return nil, nil, resp.StatusCode, err
		}
		return &policy, nil, resp.StatusCode, nil
	}

	var errRes ErrorResponse
	_ = json.Unmarshal(respBody, &errRes)
	return nil, &errRes, resp.StatusCode, nil
}

// ListTicketEvents: GET /api/v1/admin/tickets/{ticketId}/events
func (c *Client) ListTicketEvents(ctx context.Context, ticketID string) (*TicketEventsResponse, *ErrorResponse, int, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, fmt.Sprintf("%s/api/v1/admin/tickets/%s/events", c.baseURL, ticketID), nil)
	if err != nil {
		return nil, nil, 0, err
	}

	resp, body, err := c.do(req)
	if err != nil {
		return nil, nil, 0, err
	}

	if resp.StatusCode == http.StatusOK {
		var res TicketEventsResponse
		if err := json.Unmarshal(body, &res); err != nil {
			return nil, nil, resp.StatusCode, err
		}
		return &res, nil, resp.StatusCode, nil
	}

	var errRes ErrorResponse
	_ = json.Unmarshal(body, &errRes)
	return nil, &errRes, resp.StatusCode, nil
}
