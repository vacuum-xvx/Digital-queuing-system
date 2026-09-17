package persistence

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
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
func (p *Postgres) UpdateQueuePolicy(ctx context.Context, c application.UpdateQueuePolicyCommand) (domain.QueuePolicy, error) {
	var empty domain.QueuePolicy
	id, err := uuid(c.BranchID)
	if err != nil {
		return empty, err
	}
	if !validPolicy(c) {
		return empty, application.ErrInvalidState
	}
	result, err := scanPolicy(p.pool.QueryRow(ctx, `UPDATE queue_policies SET
 appointment_due_priority=$2,qr_priority=$3,live_priority=$4,
 anti_starvation_threshold_minutes=$5,anti_starvation_points_per_minute=$6,
 appointment_grace_minutes=$7,appointment_late_penalty_per_minute=$8,
 appointment_late_penalty_max_points=$9,version=version+1,updated_at=transaction_timestamp()
 WHERE branch_id=$1 AND version=$10 RETURNING `+policyColumns,
		id, c.AppointmentDuePriority, c.QRPriority, c.LivePriority, c.AntiStarvationThresholdMinutes,
		c.AntiStarvationPointsPerMinute, c.AppointmentGraceMinutes, c.AppointmentLatePenaltyPerMinute,
		c.AppointmentLatePenaltyMaxPoints, c.ExpectedVersion))
	if !errors.Is(err, application.ErrNotFound) {
		return result, err
	}
	if _, err = p.GetQueuePolicy(ctx, c.BranchID); err != nil {
		return empty, err
	}
	return empty, application.ErrPolicyVersionConflict
}
