-- 000018_near_turn_and_policy_audit.down.sql
DROP INDEX IF EXISTS notification_outbox_dedupe_idx;
ALTER TABLE notification_outbox DROP COLUMN IF EXISTS dedupe_key;

-- Restore previous 000014 constraints
ALTER TABLE ticket_events DROP CONSTRAINT IF EXISTS ticket_events_type_check;
ALTER TABLE ticket_events ADD CONSTRAINT ticket_events_type_check CHECK (type = ANY (ARRAY['CREATED'::text, 'ARRIVED'::text, 'CALLED'::text, 'SERVICE_STARTED'::text, 'COMPLETED'::text, 'CANCELLED'::text, 'NO_SHOW'::text, 'RETURNED'::text, 'REDIRECTED'::text]));

ALTER TABLE ticket_events DROP CONSTRAINT IF EXISTS ticket_events_check1;
ALTER TABLE ticket_events ADD CONSTRAINT ticket_events_check1 CHECK ((type = 'CALLED'::text AND policy_version IS NOT NULL AND policy_version > 0 AND decision_priority IS NOT NULL AND decision_priority >= 0) OR (type <> 'CALLED'::text AND policy_version IS NULL AND decision_priority IS NULL));

ALTER TABLE ticket_events DROP CONSTRAINT IF EXISTS ticket_events_check;
ALTER TABLE ticket_events ADD CONSTRAINT ticket_events_check CHECK (
  (type = 'CREATED'::text AND from_status IS NULL AND (to_status = ANY (ARRAY['WAITING'::text, 'SCHEDULED'::text])) AND window_id IS NULL)
  OR (type = 'ARRIVED'::text AND from_status IS NOT NULL AND from_status = 'SCHEDULED'::text AND (to_status = ANY (ARRAY['SCHEDULED'::text, 'WAITING'::text])) AND window_id IS NULL)
  OR (type = 'CALLED'::text AND from_status IS NOT NULL AND (from_status = ANY (ARRAY['WAITING'::text, 'SCHEDULED'::text, 'CALLED'::text])) AND to_status = 'CALLED'::text AND window_id IS NOT NULL)
  OR (type = 'SERVICE_STARTED'::text AND from_status IS NOT NULL AND from_status = 'CALLED'::text AND to_status = 'SERVING'::text AND window_id IS NOT NULL)
  OR (type = 'COMPLETED'::text AND from_status IS NOT NULL AND from_status = 'SERVING'::text AND to_status = 'COMPLETED'::text AND window_id IS NOT NULL)
  OR (type = 'CANCELLED'::text AND from_status IS NOT NULL AND (from_status = ANY (ARRAY['SCHEDULED'::text, 'WAITING'::text])) AND to_status = 'CANCELLED'::text AND window_id IS NULL)
  OR (type = 'NO_SHOW'::text AND from_status IS NOT NULL AND from_status = 'CALLED'::text AND to_status = 'NO_SHOW'::text AND window_id IS NOT NULL)
  OR ((type = ANY (ARRAY['RETURNED'::text, 'REDIRECTED'::text])) AND from_status IS NOT NULL AND (from_status = ANY (ARRAY['CALLED'::text, 'SERVING'::text])) AND to_status = 'WAITING'::text)
);
