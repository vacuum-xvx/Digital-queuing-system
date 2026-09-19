-- 000014_due_at_queue_engine.down.sql
DROP TRIGGER IF EXISTS trg_ticket_events_no_mutation ON ticket_events;
DROP FUNCTION IF EXISTS trg_ticket_events_append_only();
DROP TRIGGER IF EXISTS trg_tickets_sync_due ON tickets;
DROP FUNCTION IF EXISTS trg_tickets_sync_due_at();

DROP INDEX IF EXISTS ticket_events_request_id;
DROP INDEX IF EXISTS tickets_one_active_per_client;
DROP INDEX IF EXISTS tickets_waiting_due_at;

ALTER TABLE ticket_events
  DROP COLUMN IF EXISTS actor,
  DROP COLUMN IF EXISTS reason,
  DROP COLUMN IF EXISTS due_at,
  DROP COLUMN IF EXISTS request_id,
  DROP COLUMN IF EXISTS at;

ALTER TABLE tickets
  DROP COLUMN IF EXISTS checkin_at,
  DROP COLUMN IF EXISTS ready_at,
  DROP COLUMN IF EXISTS due_at,
  DROP COLUMN IF EXISTS source_rank,
  DROP COLUMN IF EXISTS policy_version,
  DROP COLUMN IF EXISTS recall_count,
  DROP COLUMN IF EXISTS client_id;

-- Restore previous 000013 constraint
ALTER TABLE ticket_events DROP CONSTRAINT IF EXISTS ticket_events_check;
ALTER TABLE ticket_events ADD CONSTRAINT ticket_events_check CHECK (
  (type='CREATED' AND from_status IS NULL AND to_status IN ('WAITING','SCHEDULED') AND window_id IS NULL)
  OR (type='ARRIVED' AND from_status IS NOT NULL AND from_status='SCHEDULED' AND to_status='SCHEDULED' AND window_id IS NULL)
  OR (type='CALLED' AND from_status IS NOT NULL AND from_status IN ('WAITING','SCHEDULED') AND to_status='CALLED' AND window_id IS NOT NULL)
  OR (type='SERVICE_STARTED' AND from_status IS NOT NULL AND from_status='CALLED' AND to_status='SERVING' AND window_id IS NOT NULL)
  OR (type='COMPLETED' AND from_status IS NOT NULL AND from_status='SERVING' AND to_status='COMPLETED' AND window_id IS NOT NULL)
  OR (type='CANCELLED' AND from_status IS NOT NULL AND from_status IN ('SCHEDULED','WAITING') AND to_status='CANCELLED' AND window_id IS NULL)
  OR (type='NO_SHOW' AND from_status IS NOT NULL AND from_status='CALLED' AND to_status='NO_SHOW' AND window_id IS NOT NULL)
  OR (type IN ('RETURNED','REDIRECTED') AND from_status IS NOT NULL AND from_status IN ('CALLED','SERVING') AND to_status='WAITING')
);
