DROP TABLE ticket_events;
DROP FUNCTION reject_ticket_event_mutation();
DROP TABLE queue_policies;
DROP INDEX tickets_due_appointments;
DROP FUNCTION next_appointment_public_number();
DROP SEQUENCE appointment_public_number_seq;
ALTER TABLE tickets DROP CONSTRAINT tickets_cancelled_unassigned;
ALTER TABLE tickets DROP CONSTRAINT tickets_scheduled_source;
ALTER TABLE tickets DROP CONSTRAINT tickets_scheduled_unassigned;
-- Restore pending tickets to the pre-000005 engine's WAITING eligibility.
-- Do not restore stale assignments or alter served/terminal history.
UPDATE tickets SET status='WAITING'
 WHERE source='APPOINTMENT' AND status='SCHEDULED';
-- Keep scheduled_at (owned by 000003) and appointment_requested_at. The latter
-- retains exact idempotency inputs across rollback/re-upgrade and is harmless
-- to the old engine; dropping tickets via 000002 down also drops this column.
