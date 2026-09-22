-- 000018_near_turn_and_policy_audit.up.sql
-- Add idempotency dedupe key for notification_outbox (cycle-bound)
ALTER TABLE notification_outbox ADD COLUMN IF NOT EXISTS dedupe_key text;
CREATE UNIQUE INDEX IF NOT EXISTS notification_outbox_dedupe_idx ON notification_outbox(dedupe_key);

-- Allow QUEUE_RECALCULATED event in ticket_events
ALTER TABLE ticket_events DROP CONSTRAINT IF EXISTS ticket_events_type_check;
ALTER TABLE ticket_events ADD CONSTRAINT ticket_events_type_check CHECK (
  type = ANY (ARRAY['CREATED'::text, 'ARRIVED'::text, 'CALLED'::text, 'SERVICE_STARTED'::text, 'COMPLETED'::text, 'CANCELLED'::text, 'NO_SHOW'::text, 'RETURNED'::text, 'REDIRECTED'::text, 'QUEUE_RECALCULATED'::text])
);

ALTER TABLE ticket_events DROP CONSTRAINT IF EXISTS ticket_events_check1;
ALTER TABLE ticket_events ADD CONSTRAINT ticket_events_check1 CHECK (
  (type = ANY (ARRAY['CALLED'::text, 'QUEUE_RECALCULATED'::text]) AND policy_version IS NOT NULL AND policy_version > 0)
  OR (type <> ALL (ARRAY['CALLED'::text, 'QUEUE_RECALCULATED'::text]) AND policy_version IS NULL AND decision_priority IS NULL)
);

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
  OR (type = 'QUEUE_RECALCULATED'::text AND from_status IS NULL AND (to_status = ANY (ARRAY['WAITING'::text, 'SCHEDULED'::text])) AND window_id IS NULL)
);
