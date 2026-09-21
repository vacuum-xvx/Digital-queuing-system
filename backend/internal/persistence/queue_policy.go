package persistence

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"postcode/backend/internal/application"
	"postcode/backend/internal/domain"
)

const policyColumns = `branch_id::text,appointment_due_priority,qr_priority,live_priority,
 anti_starvation_threshold_minutes,anti_starvation_points_per_minute,appointment_grace_minutes,
 appointment_late_penalty_per_minute,appointment_late_penalty_max_points,version,updated_at`
const policySelect = `SELECT ` + policyColumns + ` FROM queue_policies`

func scanPolicy(row pgx.Row) (domain.QueuePolicy, error) {
	var p domain.QueuePolicy
	err := row.Scan(&p.BranchID, &p.AppointmentDuePriority, &p.QRPriority, &p.LivePriority,
		&p.AntiStarvationThresholdMinutes, &p.AntiStarvationPointsPerMinute, &p.AppointmentGraceMinutes,
		&p.AppointmentLatePenaltyPerMinute, &p.AppointmentLatePenaltyMaxPoints, &p.Version, &p.UpdatedAt)
	p.UpdatedAt = p.UpdatedAt.UTC()
	return p, dbError(err)
}
func (p *Postgres) GetQueuePolicy(ctx context.Context, branchID string) (domain.QueuePolicy, error) {
	id, err := uuid(branchID)
	if err != nil {
		return domain.QueuePolicy{}, err
	}
	return scanPolicy(p.pool.QueryRow(ctx, policySelect+` WHERE branch_id=$1`, id))
}
func validPolicy(c application.UpdateQueuePolicyCommand) bool {
	return c.AppointmentDuePriority >= 0 && c.AppointmentDuePriority <= 1000 &&
		c.QRPriority >= 0 && c.QRPriority <= 1000 && c.LivePriority >= 0 && c.LivePriority <= 1000 &&
		c.AppointmentDuePriority > c.QRPriority && c.AppointmentDuePriority > c.LivePriority &&
		c.AntiStarvationThresholdMinutes >= 0 && c.AntiStarvationThresholdMinutes <= 240 &&
		c.AntiStarvationPointsPerMinute >= 1 && c.AntiStarvationPointsPerMinute <= 600 &&
		c.AppointmentGraceMinutes >= 0 && c.AppointmentGraceMinutes <= 120 &&
		c.AppointmentLatePenaltyPerMinute >= 0 && c.AppointmentLatePenaltyPerMinute <= 600 &&
		c.AppointmentLatePenaltyMaxPoints >= 0 && c.AppointmentLatePenaltyMaxPoints <= 1000 &&
		c.AppointmentLatePenaltyMaxPoints <= c.AppointmentDuePriority
}

func (p *Postgres) getBranchPolicyTx(ctx context.Context, tx pgx.Tx, branchID pgtype.UUID) domain.QueuePolicyConfig {
	base := p.GetPolicy()
	var qrPri, livePri, graceMin int
	err := tx.QueryRow(ctx, `SELECT qr_priority, live_priority, appointment_grace_minutes FROM queue_policies WHERE branch_id=$1`, branchID).Scan(&qrPri, &livePri, &graceMin)
	if err == nil {
		qrRank := 1
		liveRank := 2
		if livePri > qrPri {
			qrRank = 2
			liveRank = 1
		}
		if graceMin > 0 {
			base.Appointment.GraceMinutes = graceMin
		}
		newSources := make(map[string]domain.SourcePolicy, len(base.Sources))
		for k, v := range base.Sources {
			newSources[k] = v
		}
		if qr, ok := newSources["qr"]; ok {
			qr.Rank = qrRank
			newSources["qr"] = qr
		}
		if live, ok := newSources["live"]; ok {
			live.Rank = liveRank
			newSources["live"] = live
		}
		base.Sources = newSources
	}
	return base
}

func (p *Postgres) UpdateQueuePolicy(ctx context.Context, c application.UpdateQueuePolicyCommand) (domain.QueuePolicy, error) {
	var empty domain.QueuePolicy
	id, err := uuid(c.BranchID)
	if err != nil {
		return empty, err
	}
	if !validPolicy(c) {
		return empty, application.ErrInvalidState
	}

	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return empty, dbError(err)
	}
	defer tx.Rollback(ctx)

	result, err := scanPolicy(tx.QueryRow(ctx, `UPDATE queue_policies SET
 appointment_due_priority=$2,qr_priority=$3,live_priority=$4,
 anti_starvation_threshold_minutes=$5,anti_starvation_points_per_minute=$6,
 appointment_grace_minutes=$7,appointment_late_penalty_per_minute=$8,
 appointment_late_penalty_max_points=$9,version=version+1,updated_at=transaction_timestamp()
 WHERE branch_id=$1 AND version=$10 RETURNING `+policyColumns,
		id, c.AppointmentDuePriority, c.QRPriority, c.LivePriority, c.AntiStarvationThresholdMinutes,
		c.AntiStarvationPointsPerMinute, c.AppointmentGraceMinutes, c.AppointmentLatePenaltyPerMinute,
		c.AppointmentLatePenaltyMaxPoints, c.ExpectedVersion))
	if err != nil {
		if errors.Is(err, application.ErrNotFound) {
			if _, errChk := p.GetQueuePolicy(ctx, c.BranchID); errChk != nil {
				return empty, errChk
			}
			return empty, application.ErrPolicyVersionConflict
		}
		return empty, err
	}

	qrRank := 1
	liveRank := 2
	if c.LivePriority > c.QRPriority {
		qrRank = 2
		liveRank = 1
	}

	// Re-rank all waiting tickets in this branch so CallNext immediately reflects new priority
	_, err = tx.Exec(ctx, `UPDATE tickets t
	SET source_rank = CASE t.source
		WHEN 'APPOINTMENT' THEN 0
		WHEN 'QR' THEN $2
		WHEN 'LIVE' THEN $3
		ELSE t.source_rank
	END
	FROM (
		SELECT id FROM tickets
		WHERE branch_id = $1 AND status = 'WAITING'
		FOR UPDATE SKIP LOCKED
	) locked
	WHERE t.id = locked.id`, id, qrRank, liveRank)
	if err != nil {
		return empty, dbError(err)
	}

	if err = tx.Commit(ctx); err != nil {
		return empty, dbError(err)
	}

	// Update in-memory fallback policy as well
	p.policyMu.Lock()
	if p.policy.Sources != nil {
		p.policy.Appointment.GraceMinutes = c.AppointmentGraceMinutes
		if qr, ok := p.policy.Sources["qr"]; ok {
			qr.Rank = qrRank
			p.policy.Sources["qr"] = qr
		}
		if live, ok := p.policy.Sources["live"]; ok {
			live.Rank = liveRank
			p.policy.Sources["live"] = live
		}
	}
	p.policyMu.Unlock()

	return result, nil
}

