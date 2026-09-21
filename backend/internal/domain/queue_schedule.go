package domain

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"
	"time"

	"gopkg.in/yaml.v3"
)

type WindowClosePolicy string

const (
	WindowCloseFinishCurrent WindowClosePolicy = "finish_current"
	WindowCloseReturnToQueue WindowClosePolicy = "return_to_queue"
)

type AppointmentPolicy struct {
	GraceMinutes       int `yaml:"grace_minutes"`
	EarlyWindowMinutes int `yaml:"early_window_minutes"`
}

type SourcePolicy struct {
	Rank           int  `yaml:"rank"`
	MaxWaitMinutes *int `yaml:"max_wait_minutes,omitempty"`
}

type ServicePolicy struct {
	MaxWaitMinutes int `yaml:"max_wait_minutes"`
}

type CallPolicy struct {
	ClientTimeoutSeconds int `yaml:"client_timeout_seconds"`
	MaxRecalls           int `yaml:"max_recalls"`
}

type WindowCloseConfig struct {
	Policy WindowClosePolicy `yaml:"policy"`
}

type AlertsPolicy struct {
	OverdueAfterMinutes int `yaml:"overdue_after_minutes"`
}

type QueuePolicyConfig struct {
	PolicyVersion int64                    `yaml:"policy_version"`
	Appointment   AppointmentPolicy        `yaml:"appointment"`
	Sources       map[string]SourcePolicy  `yaml:"sources"`
	Services      map[string]ServicePolicy `yaml:"services"`
	Call          CallPolicy               `yaml:"call"`
	WindowClose   WindowCloseConfig        `yaml:"window_close"`
	Alerts        AlertsPolicy             `yaml:"alerts"`
}

func (c *QueuePolicyConfig) Validate() error {
	if c.PolicyVersion <= 0 {
		return errors.New("policy_version must be positive")
	}
	if c.Appointment.GraceMinutes <= 0 {
		return errors.New("appointment.grace_minutes must be positive")
	}
	if c.Appointment.EarlyWindowMinutes <= 0 {
		return errors.New("appointment.early_window_minutes must be positive")
	}
	if len(c.Sources) == 0 {
		return errors.New("sources must not be empty")
	}
	for src, sp := range c.Sources {
		if sp.Rank < 0 {
			return fmt.Errorf("source %s rank must be non-negative", src)
		}
		if sp.MaxWaitMinutes != nil && *sp.MaxWaitMinutes <= 0 {
			return fmt.Errorf("source %s max_wait_minutes must be positive", src)
		}
	}
	for svc, srv := range c.Services {
		if srv.MaxWaitMinutes <= 0 {
			return fmt.Errorf("service %s max_wait_minutes must be positive", svc)
		}
	}
	if c.Call.ClientTimeoutSeconds <= 0 {
		return errors.New("call.client_timeout_seconds must be positive")
	}
	if c.Call.MaxRecalls <= 0 {
		return errors.New("call.max_recalls must be positive")
	}
	switch c.WindowClose.Policy {
	case WindowCloseFinishCurrent, WindowCloseReturnToQueue:
		// valid
	default:
		return fmt.Errorf("window_close.policy must be 'finish_current' or 'return_to_queue', got: %s", c.WindowClose.Policy)
	}
	if c.Alerts.OverdueAfterMinutes <= 0 {
		return errors.New("alerts.overdue_after_minutes must be positive")
	}
	return nil
}

func LoadQueuePolicy(r io.Reader) (QueuePolicyConfig, error) {
	var cfg QueuePolicyConfig
	dec := yaml.NewDecoder(r)
	dec.KnownFields(true) // error on unknown fields
	if err := dec.Decode(&cfg); err != nil {
		return cfg, fmt.Errorf("failed to decode queue policy YAML: %w", err)
	}
	if err := cfg.Validate(); err != nil {
		return cfg, fmt.Errorf("queue policy validation error: %w", err)
	}
	return cfg, nil
}

func LoadQueuePolicyFile(path string) (QueuePolicyConfig, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return QueuePolicyConfig{}, err
	}
	return LoadQueuePolicy(bytes.NewReader(data))
}

type ScheduleTicketInput struct {
	Source      TicketSource
	ScheduledAt *time.Time
	ServiceID   string
}

// ComputeSchedule is a pure function that calculates due_at, ready_at and source_rank.
// No DB access and no time.Now inside!
func ComputeSchedule(policy QueuePolicyConfig, ticket ScheduleTicketInput, checkinAt time.Time) (dueAt time.Time, readyAt time.Time, sourceRank int) {
	getMaxWait := func(srcKey string) time.Duration {
		svcKey := strings.ToLower(ticket.ServiceID)
		if srv, ok := policy.Services[ticket.ServiceID]; ok && srv.MaxWaitMinutes > 0 {
			return time.Duration(srv.MaxWaitMinutes) * time.Minute
		}
		if srv, ok := policy.Services[svcKey]; ok && srv.MaxWaitMinutes > 0 {
			return time.Duration(srv.MaxWaitMinutes) * time.Minute
		}
		if sp, ok := policy.Sources[srcKey]; ok && sp.MaxWaitMinutes != nil && *sp.MaxWaitMinutes > 0 {
			return time.Duration(*sp.MaxWaitMinutes) * time.Minute
		}
		return 30 * time.Minute
	}

	srcLower := strings.ToLower(string(ticket.Source))

	switch ticket.Source {
	case TicketSourceAppointment:
		slot := time.Time{}
		if ticket.ScheduledAt != nil {
			slot = ticket.ScheduledAt.UTC()
		}
		grace := time.Duration(policy.Appointment.GraceMinutes) * time.Minute
		earlyWindow := time.Duration(policy.Appointment.EarlyWindowMinutes) * time.Minute

		aptRank := 0
		if sp, ok := policy.Sources["appointment"]; ok {
			aptRank = sp.Rank
		}
		liveRank := 2
		if sp, ok := policy.Sources["live"]; ok {
			liveRank = sp.Rank
		}

		if checkinAt.IsZero() {
			// Not checked in yet
			dueAt = slot
			readyAt = slot.Add(365 * 24 * time.Hour) // Far future until check-in
			sourceRank = aptRank
			return dueAt, readyAt, sourceRank
		}

		checkin := checkinAt.UTC()
		// APPOINTMENT, пришёл вовремя: checkin <= slot + grace
		if !checkin.After(slot.Add(grace)) {
			dueAt = slot
			earliestCall := slot.Add(-earlyWindow)
			if checkin.After(earliestCall) {
				readyAt = checkin
			} else {
				readyAt = earliestCall
			}
			sourceRank = aptRank
		} else {
			// APPOINTMENT, опоздал: checkin > slot + grace
			// Талон не теряется, клиент идёт как живая очередь: due_at = checkin + max_wait, ready_at = checkin
			maxWait := getMaxWait("live")
			dueAt = checkin.Add(maxWait)
			readyAt = checkin
			sourceRank = liveRank
		}

	case TicketSourceQR:
		qrRank := 1
		if sp, ok := policy.Sources["qr"]; ok {
			qrRank = sp.Rank
		}
		sourceRank = qrRank

		if checkinAt.IsZero() {
			// До check-in талон не вызывается
			readyAt = time.Date(9999, 12, 31, 23, 59, 59, 0, time.UTC)
			dueAt = readyAt
			return dueAt, readyAt, sourceRank
		}
		checkin := checkinAt.UTC()
		maxWait := getMaxWait("qr")
		dueAt = checkin.Add(maxWait)
		readyAt = checkin

	case TicketSourceLive:
		liveRank := 2
		if sp, ok := policy.Sources["live"]; ok {
			liveRank = sp.Rank
		}
		sourceRank = liveRank

		checkin := checkinAt.UTC()
		maxWait := getMaxWait("live")
		dueAt = checkin.Add(maxWait)
		readyAt = checkin

	default:
		sourceRank = 99
		if sp, ok := policy.Sources[srcLower]; ok {
			sourceRank = sp.Rank
		}
		checkin := checkinAt.UTC()
		maxWait := getMaxWait(srcLower)
		dueAt = checkin.Add(maxWait)
		readyAt = checkin
	}

	return dueAt.UTC(), readyAt.UTC(), sourceRank
}

func DefaultQueuePolicy() QueuePolicyConfig {
	maxWait30 := 30
	return QueuePolicyConfig{
		PolicyVersion: 1,
		Appointment: AppointmentPolicy{
			GraceMinutes:       15,
			EarlyWindowMinutes: 10,
		},
		Sources: map[string]SourcePolicy{
			"appointment": {Rank: 0},
			"qr":          {Rank: 1, MaxWaitMinutes: &maxWait30},
			"live":        {Rank: 2, MaxWaitMinutes: &maxWait30},
		},
		Services: map[string]ServicePolicy{
			"letters":                              {MaxWaitMinutes: 20},
			"parcels":                              {MaxWaitMinutes: 30},
			"payments":                             {MaxWaitMinutes: 15},
			"send":                                 {MaxWaitMinutes: 30},
			"retail":                               {MaxWaitMinutes: 15},
			"22222222-2222-2222-2222-222222222222": {MaxWaitMinutes: 30}, // Parcels
			"55555555-5555-5555-5555-555555555555": {MaxWaitMinutes: 15}, // Payments
			"33333333-2222-2222-2222-222222222222": {MaxWaitMinutes: 30}, // Send
			"44444444-2222-2222-2222-222222222222": {MaxWaitMinutes: 15}, // Retail
		},
		Call: CallPolicy{
			ClientTimeoutSeconds: 90,
			MaxRecalls:           2,
		},
		WindowClose: WindowCloseConfig{
			Policy: WindowCloseFinishCurrent,
		},
		Alerts: AlertsPolicy{
			OverdueAfterMinutes: 15,
		},
	}
}

type contextKey string

const RequestIDKey contextKey = "request_id"

func WithRequestID(ctx context.Context, requestID string) context.Context {
	return context.WithValue(ctx, RequestIDKey, requestID)
}

func RequestIDFromContext(ctx context.Context) string {
	if ctx == nil {
		return ""
	}
	if v, ok := ctx.Value(RequestIDKey).(string); ok {
		return v
	}
	if v, ok := ctx.Value("request_id").(string); ok {
		return v
	}
	return ""
}

