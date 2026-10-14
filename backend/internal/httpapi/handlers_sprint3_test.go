package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
	"time"

	"postcode/backend/internal/application"
	"postcode/backend/internal/domain"
)

const apiBranch = "11111111-1111-1111-1111-111111111111"
const apiService = "22222222-2222-2222-2222-222222222222"
const apiTicket = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
const policyURL = "/api/v1/admin/branches/" + apiBranch + "/queue-policy"

func request3(t *testing.T, h http.Handler, method, path, body, key string, status int) *httptest.ResponseRecorder {
	t.Helper()
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	if key != "" {
		r.Header.Set("Idempotency-Key", key)
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != status {
		t.Fatalf("%s %s: %d want %d: %s", method, path, w.Code, status, w.Body.String())
	}
	if status >= 400 {
		var e ErrorResponse
		if err := json.Unmarshal(w.Body.Bytes(), &e); err != nil {
			t.Fatal(err)
		}
		if e.Error.RequestID == "" || e.Error.RequestID != w.Header().Get("X-Request-ID") {
			t.Fatal("missing requestId", w.Body.String())
		}
	}
	return w
}
func fields3(t *testing.T, w *httptest.ResponseRecorder) map[string]json.RawMessage {
	t.Helper()
	var m map[string]json.RawMessage
	if err := json.Unmarshal(w.Body.Bytes(), &m); err != nil {
		t.Fatal(err)
	}
	return m
}
func assertTicket3(t *testing.T, data []byte) {
	t.Helper()
	var m map[string]json.RawMessage
	if err := json.Unmarshal(data, &m); err != nil {
		t.Fatal(err)
	}
	if len(m) != 12 {
		t.Fatalf("common ticket fields: %s", data)
	}
	for _, key := range []string{"scheduledAt", "arrivedAt", "noShowAt"} {
		if _, ok := m[key]; ok {
			t.Fatal("leaked", key)
		}
	}
}

func TestSprint3LiveHTTP(t *testing.T) {
	calls := 0
	uc := &FakeUseCases{CreateLiveTicketFunc: func(_ context.Context, c application.CreateLiveTicketCommand) (application.CreateLiveTicketResult, error) {
		calls++
		if c.BranchID != apiBranch || c.ServiceID != apiService {
			t.Fatal(c)
		}
		if c.IdempotencyKey == "conflict" {
			return application.CreateLiveTicketResult{}, application.ErrIdempotencyConflict
		}
		now := time.Now()
		return application.CreateLiveTicketResult{Replayed: c.IdempotencyKey == "replay", Ticket: domain.Ticket{ID: apiTicket, Source: domain.TicketSourceLive, Status: domain.TicketStatusWaiting, ArrivedAt: &now, NoShowAt: &now, ScheduledAt: &now}}, nil
	}}
	h := setupTest(uc)
	body := `{"serviceId":"` + apiService + `"}`
	for _, path := range []string{"/api/v1/operator/branches/" + apiBranch + "/tickets/live", "/api/v1/branches/" + apiBranch + "/tickets/live"} {
		for _, tc := range []struct {
			key    string
			status int
		}{{"create", 201}, {"replay", 200}, {"conflict", 409}} {
			w := request3(t, h, "POST", path, body, tc.key, tc.status)
			if tc.status < 400 {
				assertTicket3(t, w.Body.Bytes())
			}
		}
	}
	before := calls
	for _, bad := range []string{"", `null`, `{}`, `{"serviceId":null}`, `{"serviceId":"bad"}`, body + ` {}`, `{"serviceId":"` + apiService + `","unknown":1}`} {
		request3(t, h, "POST", "/api/v1/operator/branches/"+apiBranch+"/tickets/live", bad, "key", 400)
	}
	for _, key := range []string{"", "  "} {
		request3(t, h, "POST", "/api/v1/operator/branches/"+apiBranch+"/tickets/live", body, key, 400)
	}
	request3(t, h, "POST", "/api/v1/operator/branches/bad/tickets/live", body, "key", 400)
	if calls != before {
		t.Fatal("invalid input reached Core")
	}
}

func TestSprint3ArrivalNoShowAndErrors(t *testing.T) {
	now := time.Now().UTC()
	var coreErr error
	uc := &FakeUseCases{
		ArriveAppointmentFunc: func(_ context.Context, id string) (application.AppointmentView, error) {
			if id != apiTicket {
				t.Fatal(id)
			}
			return application.AppointmentView{Ticket: domain.Ticket{ID: id, Source: domain.TicketSourceAppointment, Status: domain.TicketStatusScheduled, ArrivedAt: &now}, ScheduledAt: now}, coreErr
		},
		MarkNoShowFunc: func(_ context.Context, id string) (domain.Ticket, error) {
			return domain.Ticket{ID: id, Status: domain.TicketStatusNoShow, NoShowAt: &now}, coreErr
		},
		GetQueuePositionFunc: func(_ context.Context, id string) (domain.QueuePosition, error) {
			return domain.QueuePosition{}, coreErr
		},
	}
	h := setupTest(uc)
	for i := 0; i < 2; i++ {
		w := request3(t, h, "POST", "/api/v1/appointments/"+apiTicket+"/arrive", "", "", 200)
		m := fields3(t, w)
		if len(m) != 2 {
			t.Fatal(m)
		}
		assertTicket3(t, m["ticket"])
		w = request3(t, h, "POST", "/api/v1/operator/tickets/"+apiTicket+"/no-show", "", "", 200)
		assertTicket3(t, w.Body.Bytes())
	}
	for _, tc := range []struct {
		err    error
		status int
		code   string
	}{
		{application.ErrNotFound, 404, "NOT_FOUND"}, {application.ErrInvalidState, 409, "INVALID_TICKET_STATE"},
		{application.ErrWindowBusy, 409, "WINDOW_BUSY"}, {application.ErrNoEligibleTickets, 409, "NO_ELIGIBLE_TICKETS"},
		{application.ErrIdempotencyConflict, 409, "IDEMPOTENCY_CONFLICT"}, {application.ErrPolicyVersionConflict, 409, "POLICY_VERSION_CONFLICT"},
		{errors.New("postgres password=secret SQL details"), 500, "INTERNAL_ERROR"},
	} {
		coreErr = fmt.Errorf("private database context: %w", tc.err)
		for _, path := range []string{"/api/v1/appointments/" + apiTicket + "/arrive", "/api/v1/operator/tickets/" + apiTicket + "/no-show"} {
			w := request3(t, h, "POST", path, "", "", tc.status)
			var e ErrorResponse
			json.Unmarshal(w.Body.Bytes(), &e)
			if e.Error.Code != tc.code || strings.Contains(w.Body.String(), "private") || strings.Contains(w.Body.String(), "secret") {
				t.Fatal(w.Body.String())
			}
		}
	}
	request3(t, h, "POST", "/api/v1/appointments/bad/arrive", "", "", 400)
	request3(t, h, "POST", "/api/v1/operator/tickets/bad/no-show", "", "", 400)
	request3(t, h, "GET", "/api/v1/tickets/bad/position", "", "", 400)
	for _, tc := range []struct {
		err    error
		status int
	}{{application.ErrNotFound, 404}, {errors.New("secret"), 500}} {
		coreErr = tc.err
		request3(t, h, "GET", "/api/v1/tickets/"+apiTicket+"/position", "", "", tc.status)
	}
}

func TestSprint3PositionDTO(t *testing.T) {
	now := time.Now().UTC()
	rank := 3
	priority := int64(40000000010)
	for _, reason := range []domain.QueuePositionReason{domain.QueuePositionAvailable, domain.QueuePositionNotEligibleYet, domain.QueuePositionNotQueued, domain.QueuePositionNoOpenCompatibleWindow} {
		p := domain.QueuePosition{TicketID: apiTicket, TicketStatus: domain.TicketStatusWaiting, Reason: reason, CalculatedAt: now}
		if reason == domain.QueuePositionAvailable {
			p.Position = &rank
			p.EffectivePriority = &priority
			p.EffectiveQueueTime = &now
			p.ReferenceWindow = &domain.WindowRef{ID: apiService, Number: 1}
		}
		uc := &FakeUseCases{GetQueuePositionFunc: func(context.Context, string) (domain.QueuePosition, error) { return p, nil }}
		w := request3(t, setupTest(uc), "GET", "/api/v1/tickets/"+apiTicket+"/position", "", "", 200)
		m := fields3(t, w)
		if len(m) != 8 {
			t.Fatal(m)
		}
		for _, k := range []string{"position", "referenceWindow", "effectivePriority", "effectiveQueueTime"} {
			if _, ok := m[k]; !ok {
				t.Fatal("omitted", k)
			}
			if reason != domain.QueuePositionAvailable && string(m[k]) != "null" {
				t.Fatal(m)
			}
		}
		var got QueuePositionDTO
		json.Unmarshal(w.Body.Bytes(), &got)
		if got.Reason != string(reason) {
			t.Fatal(got)
		}
		if reason == domain.QueuePositionAvailable && (*got.Position != rank || *got.EffectivePriority != priority || !got.CalculatedAt.Equal(now)) {
			t.Fatal(got)
		}
	}
}

func TestSprint3PolicyMerge(t *testing.T) {
	current := domain.QueuePolicy{BranchID: apiBranch, AppointmentDuePriority: 100, QRPriority: 10, LivePriority: 12, AntiStarvationThresholdMinutes: 23, AntiStarvationPointsPerMinute: 19, AppointmentGraceMinutes: 8, AppointmentLatePenaltyPerMinute: 7, AppointmentLatePenaltyMaxPoints: 65, Version: 9, UpdatedAt: time.Now().UTC()}
	var command application.UpdateQueuePolicyCommand
	reads, writes := 0, 0
	var readErr, writeErr error
	uc := &FakeUseCases{
		GetQueuePolicyFunc: func(context.Context, string) (domain.QueuePolicy, error) { reads++; return current, readErr },
		UpdateQueuePolicyFunc: func(_ context.Context, c application.UpdateQueuePolicyCommand) (domain.QueuePolicy, error) {
			writes++
			command = c
			updated := current
			updated.Version++
			updated.LivePriority = c.LivePriority
			return updated, writeErr
		},
	}
	h := setupTest(uc)
	w := request3(t, h, "GET", policyURL, "", "", 200)
	if len(fields3(t, w)) != 11 {
		t.Fatal(w.Body.String())
	}
	legacy := `{"appointmentDuePriority":200,"qrPriority":20,"expectedVersion":9}`
	w = request3(t, h, "PUT", policyURL, legacy, "", 200)
	want := application.UpdateQueuePolicyCommand{BranchID: apiBranch, AppointmentDuePriority: 200, QRPriority: 20, LivePriority: 12, AntiStarvationThresholdMinutes: 23, AntiStarvationPointsPerMinute: 19, AppointmentGraceMinutes: 8, AppointmentLatePenaltyPerMinute: 7, AppointmentLatePenaltyMaxPoints: 65, ExpectedVersion: 9}
	if !reflect.DeepEqual(command, want) {
		t.Fatalf("command=%+v want=%+v", command, want)
	}
	if string(fields3(t, w)["version"]) != "10" {
		t.Fatal(w.Body.String())
	}
	full := `{"appointmentDuePriority":300,"qrPriority":30,"livePriority":0,"antiStarvationThresholdMinutes":0,"antiStarvationPointsPerMinute":1,"appointmentGraceMinutes":0,"appointmentLatePenaltyPerMinute":0,"appointmentLatePenaltyMaxPoints":0,"expectedVersion":9}`
	request3(t, h, "PUT", policyURL, full, "", 200)
	if command.LivePriority != 0 || command.AntiStarvationThresholdMinutes != 0 || command.AntiStarvationPointsPerMinute != 1 || command.AppointmentGraceMinutes != 0 || command.AppointmentLatePenaltyPerMinute != 0 || command.AppointmentLatePenaltyMaxPoints != 0 {
		t.Fatal(command)
	}
	before := writes
	w = request3(t, h, "PUT", policyURL, strings.Replace(legacy, `:9}`, `:8}`, 1), "", 409)
	var conflict ErrorResponse
	if err := json.Unmarshal(w.Body.Bytes(), &conflict); err != nil || conflict.Error.Code != "POLICY_VERSION_CONFLICT" {
		t.Fatalf("stale policy error code: %s", w.Body.String())
	}
	if writes != before {
		t.Fatal("stale command sent")
	}
	// Race after GET must preserve expectedVersion; never retry or overwrite.
	writeErr = application.ErrPolicyVersionConflict
	request3(t, h, "PUT", policyURL, legacy, "", 409)
	if writes != before+1 || command.ExpectedVersion != 9 {
		t.Fatal(command, writes)
	}
	writeErr = application.ErrInvalidState
	w = request3(t, h, "PUT", policyURL, legacy, "", 400)
	var validation ErrorResponse
	if err := json.Unmarshal(w.Body.Bytes(), &validation); err != nil || validation.Error.Code != "VALIDATION_ERROR" {
		t.Fatalf("policy validation error code: %s", w.Body.String())
	}
	writeErr = errors.New("private SQL")
	w = request3(t, h, "PUT", policyURL, legacy, "", 500)
	if strings.Contains(w.Body.String(), "SQL") {
		t.Fatal(w.Body.String())
	}
	readErr = application.ErrNotFound
	before = writes
	request3(t, h, "PUT", policyURL, legacy, "", 404)
	if writes != before {
		t.Fatal("updated after failed read")
	}
	readErr = nil
	writeErr = nil
	beforeReads := reads
	for _, name := range []string{"appointmentDuePriority", "qrPriority", "livePriority", "antiStarvationThresholdMinutes", "antiStarvationPointsPerMinute", "appointmentGraceMinutes", "appointmentLatePenaltyPerMinute", "appointmentLatePenaltyMaxPoints", "expectedVersion"} {
		for _, value := range []string{"null", "1.5", `"10"`, "true", "{}", "9223372036854775808"} {
			var m map[string]json.RawMessage
			json.Unmarshal([]byte(legacy), &m)
			m[name] = json.RawMessage(value)
			body, _ := json.Marshal(m)
			request3(t, h, "PUT", policyURL, string(body), "", 400)
		}
	}
	for _, body := range []string{"null", "[]", "{}", legacy + ` {}`, strings.TrimSuffix(legacy, "}") + `,"unknown":1}`} {
		request3(t, h, "PUT", policyURL, body, "", 400)
	}
	if reads != beforeReads {
		t.Fatal("invalid syntax reached Core")
	}
}

func TestSprint3EventMapping(t *testing.T) {
	priority := int64(40000000010)
	uc := &FakeUseCases{ListTicketEventsFunc: func(context.Context, string) ([]domain.TicketEvent, error) {
		return []domain.TicketEvent{{Type: domain.TicketEventArrived}, {Type: domain.TicketEventNoShow}, {Type: domain.TicketEventCalled, DecisionPriority: &priority}}, nil
	}}
	w := request3(t, setupTest(uc), "GET", "/api/v1/admin/tickets/"+apiTicket+"/events", "", "", 200)
	var got ListTicketEventsResponse
	json.Unmarshal(w.Body.Bytes(), &got)
	if got.Items[0].Type != "ARRIVED" || got.Items[1].Type != "NO_SHOW" || *got.Items[2].DecisionPriority != priority {
		t.Fatal(got)
	}
}

func TestSprint3PolicyGetAllFields(t *testing.T) {
	updated := time.Date(2026, 9, 17, 12, 0, 0, 0, time.UTC)
	uc := &FakeUseCases{GetQueuePolicyFunc: func(context.Context, string) (domain.QueuePolicy, error) {
		return domain.QueuePolicy{BranchID: apiBranch, AppointmentDuePriority: 100, QRPriority: 10, LivePriority: 11, AntiStarvationThresholdMinutes: 15, AntiStarvationPointsPerMinute: 10, AppointmentGraceMinutes: 15, AppointmentLatePenaltyPerMinute: 5, AppointmentLatePenaltyMaxPoints: 90, Version: 2, UpdatedAt: updated}, nil
	}}
	w := request3(t, setupTest(uc), "GET", policyURL, "", "", 200)
	var got QueuePolicyDTO
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got.BranchID != apiBranch || got.AppointmentDuePriority != 100 || got.QRPriority != 10 || got.LivePriority != 11 || got.AntiStarvationThresholdMinutes != 15 || got.AntiStarvationPointsPerMinute != 10 || got.AppointmentGraceMinutes != 15 || got.AppointmentLatePenaltyPerMinute != 5 || got.AppointmentLatePenaltyMaxPoints != 90 || got.Version != 2 || !got.UpdatedAt.Equal(updated) {
		t.Fatalf("incomplete policy: %+v", got)
	}
}

func TestSprint3PanicEnvelope(t *testing.T) {
	uc := &FakeUseCases{MarkNoShowFunc: func(context.Context, string) (domain.Ticket, error) {
		panic("private database details")
	}}
	w := request3(t, setupTest(uc), "POST", "/api/v1/operator/tickets/"+apiTicket+"/no-show", "", "", 500)
	var envelope ErrorResponse
	if err := json.Unmarshal(w.Body.Bytes(), &envelope); err != nil {
		t.Fatal(err)
	}
	if envelope.Error.Code != "INTERNAL_ERROR" || strings.Contains(w.Body.String(), "private") {
		t.Fatal(w.Body.String())
	}
}
