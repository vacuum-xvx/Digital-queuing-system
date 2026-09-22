package domain

import (
	"strings"
	"testing"
	"time"
)

func defaultTestPolicy() QueuePolicyConfig {
	qrWait := 30
	liveWait := 30
	return QueuePolicyConfig{
		PolicyVersion: 1,
		Appointment: AppointmentPolicy{
			GraceMinutes:       30,
			EarlyWindowMinutes: 15,
		},
		Sources: map[string]SourcePolicy{
			"appointment": {Rank: 0},
			"qr":          {Rank: 1, MaxWaitMinutes: &qrWait},
			"live":        {Rank: 2, MaxWaitMinutes: &liveWait},
		},
		Services: map[string]ServicePolicy{
			"svc-fast": {MaxWaitMinutes: 10},
		},
		Call: CallPolicy{
			ClientTimeoutSeconds: 90,
			MaxRecalls:           2,
		},
		WindowClose: WindowCloseConfig{
			Policy: WindowCloseFinishCurrent,
		},
		Alerts: AlertsPolicy{
			OverdueAfterMinutes: 5,
		},
	}
}

func TestComputeScheduleTableDriven(t *testing.T) {
	policy := defaultTestPolicy()
	baseSlot := time.Date(2026, 9, 20, 15, 0, 0, 0, time.UTC)

	tests := []struct {
		name         string
		ticket       ScheduleTicketInput
		checkinAt    time.Time
		wantDueAt    time.Time
		wantReadyAt  time.Time
		wantRank     int
		checkReadyGe bool // check readyAt >= wantReadyAt if far future
	}{
		{
			name: "APPOINTMENT вовремя (check-in ровно в slot)",
			ticket: ScheduleTicketInput{
				Source:      TicketSourceAppointment,
				ScheduledAt: &baseSlot,
			},
			checkinAt:   baseSlot,
			wantDueAt:   baseSlot,
			wantReadyAt: baseSlot,
			wantRank:    0,
		},
		{
			name: "APPOINTMENT ранний приход до 15-мин окна (check-in 14:30, slot 15:00, early=15m -> live очередь, rank=2, ready=checkin)",
			ticket: ScheduleTicketInput{
				Source:      TicketSourceAppointment,
				ScheduledAt: &baseSlot,
			},
			checkinAt:   baseSlot.Add(-30 * time.Minute),
			wantDueAt:   baseSlot.Add(-30 * time.Minute).Add(30 * time.Minute), // 15:00
			wantReadyAt: baseSlot.Add(-30 * time.Minute),                       // 14:30
			wantRank:    2,                                                     // live rank
		},
		{
			name: "APPOINTMENT приход в раннем 15-мин окне (check-in 14:50, slot 15:00, early=15m -> вовремя, rank=0, ready=checkin)",
			ticket: ScheduleTicketInput{
				Source:      TicketSourceAppointment,
				ScheduledAt: &baseSlot,
			},
			checkinAt:   baseSlot.Add(-10 * time.Minute),
			wantDueAt:   baseSlot,
			wantReadyAt: baseSlot.Add(-10 * time.Minute), // 14:50
			wantRank:    0,                              // appointment rank
		},
		{
			name: "APPOINTMENT ровно на границе grace (check-in 15:30, grace=30m)",
			ticket: ScheduleTicketInput{
				Source:      TicketSourceAppointment,
				ScheduledAt: &baseSlot,
			},
			checkinAt:   baseSlot.Add(30 * time.Minute),
			wantDueAt:   baseSlot,
			wantReadyAt: baseSlot.Add(30 * time.Minute), // 15:30
			wantRank:    0,
		},
		{
			name: "APPOINTMENT опоздал свыше 30 мин (check-in 15:31, grace=30m, max_wait=30m -> live очередь)",
			ticket: ScheduleTicketInput{
				Source:      TicketSourceAppointment,
				ScheduledAt: &baseSlot,
			},
			checkinAt:   baseSlot.Add(31 * time.Minute),
			wantDueAt:   baseSlot.Add(31 * time.Minute).Add(30 * time.Minute), // 16:01
			wantReadyAt: baseSlot.Add(31 * time.Minute),                       // 15:31
			wantRank:    2,                                                    // live rank
		},
		{
			name: "APPOINTMENT опоздал с override по услуге (svc-fast max_wait=10m)",
			ticket: ScheduleTicketInput{
				Source:      TicketSourceAppointment,
				ScheduledAt: &baseSlot,
				ServiceID:   "svc-fast",
			},
			checkinAt:   baseSlot.Add(35 * time.Minute),
			wantDueAt:   baseSlot.Add(35 * time.Minute).Add(10 * time.Minute), // 15:45
			wantReadyAt: baseSlot.Add(35 * time.Minute),                       // 15:35
			wantRank:    2,
		},
		{
			name: "QR до check-in (не готов к вызову)",
			ticket: ScheduleTicketInput{
				Source: TicketSourceQR,
			},
			checkinAt:    time.Time{},
			checkReadyGe: true,
			wantReadyAt:  time.Date(9000, 1, 1, 0, 0, 0, 0, time.UTC),
			wantRank:     1,
		},
		{
			name: "QR после check-in (max_wait=30m)",
			ticket: ScheduleTicketInput{
				Source: TicketSourceQR,
			},
			checkinAt:   baseSlot,
			wantDueAt:   baseSlot.Add(30 * time.Minute),
			wantReadyAt: baseSlot,
			wantRank:    1,
		},
		{
			name: "QR после check-in с override по услуге (svc-fast max_wait=10m)",
			ticket: ScheduleTicketInput{
				Source:    TicketSourceQR,
				ServiceID: "svc-fast",
			},
			checkinAt:   baseSlot,
			wantDueAt:   baseSlot.Add(10 * time.Minute),
			wantReadyAt: baseSlot,
			wantRank:    1,
		},
		{
			name: "LIVE очередь (max_wait=30m)",
			ticket: ScheduleTicketInput{
				Source: TicketSourceLive,
			},
			checkinAt:   baseSlot,
			wantDueAt:   baseSlot.Add(30 * time.Minute),
			wantReadyAt: baseSlot,
			wantRank:    2,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			dueAt, readyAt, rank := ComputeSchedule(policy, tc.ticket, tc.checkinAt)
			if rank != tc.wantRank {
				t.Errorf("rank: got %d, want %d", rank, tc.wantRank)
			}
			if tc.checkReadyGe {
				if readyAt.Before(tc.wantReadyAt) {
					t.Errorf("readyAt before check-in should be far future, got: %v", readyAt)
				}
			} else {
				if !readyAt.Equal(tc.wantReadyAt) {
					t.Errorf("readyAt: got %v, want %v", readyAt, tc.wantReadyAt)
				}
				if !dueAt.Equal(tc.wantDueAt) {
					t.Errorf("dueAt: got %v, want %v", dueAt, tc.wantDueAt)
				}
			}
		})
	}
}

func TestPolicyValidationAndHotReload(t *testing.T) {
	validYAML := `
policy_version: 1
appointment:
  grace_minutes: 15
  early_window_minutes: 10
sources:
  appointment:
    rank: 0
  qr:
    rank: 1
    max_wait_minutes: 30
  live:
    rank: 2
    max_wait_minutes: 30
services:
  "fast":
    max_wait_minutes: 10
call:
  client_timeout_seconds: 90
  max_recalls: 2
window_close:
  policy: finish_current
alerts:
  overdue_after_minutes: 5
`
	cfg, err := LoadQueuePolicy(strings.NewReader(validYAML))
	if err != nil {
		t.Fatalf("unexpected load error: %v", err)
	}
	if cfg.Appointment.GraceMinutes != 15 {
		t.Errorf("grace_minutes = %d, want 15", cfg.Appointment.GraceMinutes)
	}

	// Unknown key must fail
	unknownYAML := validYAML + "\nunknown_field: 123\n"
	_, err = LoadQueuePolicy(strings.NewReader(unknownYAML))
	if err == nil {
		t.Fatal("expected error on unknown YAML field, got nil")
	}

	// Negative value must fail
	negYAML := strings.Replace(validYAML, "grace_minutes: 15", "grace_minutes: -5", 1)
	_, err = LoadQueuePolicy(strings.NewReader(negYAML))
	if err == nil {
		t.Fatal("expected error on negative grace_minutes, got nil")
	}

	// Zero value must fail
	zeroYAML := strings.Replace(validYAML, "client_timeout_seconds: 90", "client_timeout_seconds: 0", 1)
	_, err = LoadQueuePolicy(strings.NewReader(zeroYAML))
	if err == nil {
		t.Fatal("expected error on zero client_timeout_seconds, got nil")
	}

	// Hot reload with changed values changes behavior without code changes
	changedYAML := strings.Replace(validYAML, "grace_minutes: 15", "grace_minutes: 30", 1)
	newCfg, err := LoadQueuePolicy(strings.NewReader(changedYAML))
	if err != nil {
		t.Fatalf("failed reloading config: %v", err)
	}
	if newCfg.Appointment.GraceMinutes != 30 {
		t.Errorf("reloaded grace_minutes = %d, want 30", newCfg.Appointment.GraceMinutes)
	}
}
