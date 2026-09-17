ALTER TABLE tickets
 ADD COLUMN arrived_at timestamptz,
 ADD COLUMN no_show_at timestamptz,
 ADD CONSTRAINT tickets_arrival_source CHECK (arrived_at IS NULL OR source='APPOINTMENT'),
 ADD CONSTRAINT tickets_no_show_fact CHECK ((status='NO_SHOW') = (no_show_at IS NOT NULL)),
 ADD CONSTRAINT tickets_no_show_called CHECK (status<>'NO_SHOW' OR called_at IS NOT NULL);

ALTER TABLE queue_policies
 ADD COLUMN live_priority integer NOT NULL DEFAULT 10,
 ADD COLUMN anti_starvation_threshold_minutes integer NOT NULL DEFAULT 15,
 ADD COLUMN anti_starvation_points_per_minute integer NOT NULL DEFAULT 10,
 ADD COLUMN appointment_grace_minutes integer NOT NULL DEFAULT 15,
 ADD COLUMN appointment_late_penalty_per_minute integer NOT NULL DEFAULT 5,
 ADD COLUMN appointment_late_penalty_max_points integer NOT NULL DEFAULT 90;
-- Install the frozen Sprint 3 defaults as one versioned policy change per branch.
UPDATE queue_policies SET appointment_due_priority=100, qr_priority=10,
 version=version+1, updated_at=transaction_timestamp();
ALTER TABLE queue_policies
 ADD CONSTRAINT policy_live_range CHECK (live_priority BETWEEN 0 AND 1000 AND appointment_due_priority>live_priority),
 ADD CONSTRAINT policy_aging_range CHECK (anti_starvation_threshold_minutes BETWEEN 0 AND 240 AND anti_starvation_points_per_minute BETWEEN 1 AND 600),
 ADD CONSTRAINT policy_lateness_range CHECK (appointment_grace_minutes BETWEEN 0 AND 120 AND appointment_late_penalty_per_minute BETWEEN 0 AND 600 AND appointment_late_penalty_max_points BETWEEN 0 AND 1000 AND appointment_late_penalty_max_points<=appointment_due_priority);

ALTER TABLE ticket_events DROP CONSTRAINT ticket_events_type_check,
 DROP CONSTRAINT ticket_events_check, DROP CONSTRAINT ticket_events_check1;
ALTER TABLE ticket_events ALTER COLUMN decision_priority TYPE bigint;
ALTER TABLE ticket_events
 ADD CONSTRAINT ticket_events_type_check CHECK (type IN ('CREATED','ARRIVED','CALLED','SERVICE_STARTED','COMPLETED','CANCELLED','NO_SHOW')),
 ADD CONSTRAINT ticket_events_check CHECK (
 (type='CREATED' AND from_status IS NULL AND to_status IN ('WAITING','SCHEDULED') AND window_id IS NULL)
 OR (type='ARRIVED' AND from_status IS NOT NULL AND from_status='SCHEDULED' AND to_status='SCHEDULED' AND window_id IS NULL)
 OR (type='CALLED' AND from_status IS NOT NULL AND from_status IN ('WAITING','SCHEDULED') AND to_status='CALLED' AND window_id IS NOT NULL)
 OR (type='SERVICE_STARTED' AND from_status IS NOT NULL AND from_status='CALLED' AND to_status='SERVING' AND window_id IS NOT NULL)
 OR (type='COMPLETED' AND from_status IS NOT NULL AND from_status='SERVING' AND to_status='COMPLETED' AND window_id IS NOT NULL)
 OR (type='CANCELLED' AND from_status IS NOT NULL AND from_status='SCHEDULED' AND to_status='CANCELLED' AND window_id IS NULL)
 OR (type='NO_SHOW' AND from_status IS NOT NULL AND from_status='CALLED' AND to_status='NO_SHOW' AND window_id IS NOT NULL)),
 ADD CONSTRAINT ticket_events_check1 CHECK (
 (type='CALLED' AND policy_version IS NOT NULL AND policy_version>0 AND decision_priority IS NOT NULL AND decision_priority>=0)
 OR (type<>'CALLED' AND policy_version IS NULL AND decision_priority IS NULL));

CREATE SEQUENCE live_public_number_seq;
DO $$
DECLARE highest_number bigint;
BEGIN
 SELECT max(substring(public_number FROM 3)::bigint) INTO highest_number FROM tickets WHERE public_number ~ '^L-[0-9]+$';
 IF highest_number>0 THEN PERFORM setval('live_public_number_seq',highest_number,true); END IF;
END $$;
CREATE FUNCTION next_live_public_number() RETURNS text LANGUAGE sql VOLATILE AS $$
 SELECT 'L-' || lpad(n::text,greatest(6,length(n::text)),'0') FROM (SELECT nextval('live_public_number_seq') AS n) s
$$;
CREATE INDEX tickets_qr_live_candidates ON tickets(branch_id,queue_entered_at,id) INCLUDE(service_id)
 WHERE source IN ('QR','LIVE') AND status='WAITING';
-- tickets_due_appointments and tickets_one_active_per_window remain authoritative.
