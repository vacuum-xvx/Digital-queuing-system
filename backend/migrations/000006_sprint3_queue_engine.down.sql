-- Refuse a lossy rollback of immutable Sprint 3 facts/audit. Fresh databases and
-- installations without such data can roll back normally; never rewrite audit.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM tickets WHERE arrived_at IS NOT NULL OR no_show_at IS NOT NULL)
 OR EXISTS(SELECT 1 FROM ticket_events WHERE type IN ('ARRIVED','NO_SHOW') OR decision_priority>1000)
 THEN RAISE EXCEPTION 'Sprint 3 facts/audit cannot be represented by Sprint 2; rollback refused'; END IF;
END $$;
DROP INDEX tickets_qr_live_candidates;
DROP FUNCTION next_live_public_number();
DROP SEQUENCE live_public_number_seq;
ALTER TABLE tickets DROP CONSTRAINT tickets_arrival_source,
 DROP CONSTRAINT tickets_no_show_fact, DROP CONSTRAINT tickets_no_show_called,
 DROP COLUMN arrived_at, DROP COLUMN no_show_at;
ALTER TABLE queue_policies DROP CONSTRAINT policy_live_range, DROP CONSTRAINT policy_aging_range,
 DROP CONSTRAINT policy_lateness_range,
 DROP COLUMN live_priority, DROP COLUMN anti_starvation_threshold_minutes,
 DROP COLUMN anti_starvation_points_per_minute, DROP COLUMN appointment_grace_minutes,
 DROP COLUMN appointment_late_penalty_per_minute, DROP COLUMN appointment_late_penalty_max_points;
ALTER TABLE ticket_events DROP CONSTRAINT ticket_events_type_check,
 DROP CONSTRAINT ticket_events_check, DROP CONSTRAINT ticket_events_check1;
ALTER TABLE ticket_events ALTER COLUMN decision_priority TYPE integer;
ALTER TABLE ticket_events
 ADD CONSTRAINT ticket_events_type_check CHECK(type IN ('CREATED','CALLED','SERVICE_STARTED','COMPLETED','CANCELLED')),
 ADD CONSTRAINT ticket_events_check CHECK (
 (type='CREATED' AND from_status IS NULL AND to_status IN ('WAITING','SCHEDULED') AND window_id IS NULL)
 OR (type='CALLED' AND from_status IS NOT NULL AND from_status IN ('WAITING','SCHEDULED') AND to_status='CALLED' AND window_id IS NOT NULL)
 OR (type='SERVICE_STARTED' AND from_status IS NOT NULL AND from_status='CALLED' AND to_status='SERVING' AND window_id IS NOT NULL)
 OR (type='COMPLETED' AND from_status IS NOT NULL AND from_status='SERVING' AND to_status='COMPLETED' AND window_id IS NOT NULL)
 OR (type='CANCELLED' AND from_status IS NOT NULL AND from_status='SCHEDULED' AND to_status='CANCELLED' AND window_id IS NULL)),
 ADD CONSTRAINT ticket_events_check1 CHECK (
 (type='CALLED' AND policy_version IS NOT NULL AND policy_version>0 AND decision_priority IS NOT NULL AND decision_priority BETWEEN 0 AND 1000)
 OR (type<>'CALLED' AND policy_version IS NULL AND decision_priority IS NULL));
