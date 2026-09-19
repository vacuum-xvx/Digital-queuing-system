-- 000014_due_at_queue_engine.up.sql
-- Add due_at algorithm scheduling columns to tickets
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS checkin_at timestamptz,
  ADD COLUMN IF NOT EXISTS ready_at timestamptz,
  ADD COLUMN IF NOT EXISTS due_at timestamptz,
  ADD COLUMN IF NOT EXISTS source_rank integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS policy_version bigint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS recall_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS client_id text;

-- Add journal tracking columns to ticket_events
ALTER TABLE ticket_events
  ADD COLUMN IF NOT EXISTS actor text,
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS due_at timestamptz,
  ADD COLUMN IF NOT EXISTS request_id text,
  ADD COLUMN IF NOT EXISTS at timestamptz DEFAULT clock_timestamp();

-- Backfill existing WAITING tickets
UPDATE tickets
SET checkin_at = COALESCE(arrived_at, queue_entered_at, created_at),
    ready_at = COALESCE(arrived_at, queue_entered_at, created_at),
    due_at = COALESCE(arrived_at, queue_entered_at, created_at) + interval '30 minutes',
    source_rank = CASE source WHEN 'APPOINTMENT' THEN 0 WHEN 'QR' THEN 1 ELSE 2 END,
    policy_version = 1,
    recall_count = 0
WHERE status = 'WAITING' AND due_at IS NULL;

-- Backfill existing SCHEDULED tickets (appointment slot time is due_at, ready at slot - 10 min)
UPDATE tickets
SET ready_at = COALESCE(scheduled_at - interval '10 minutes', created_at),
    due_at = COALESCE(scheduled_at, created_at),
    source_rank = 0,
    policy_version = 1,
    recall_count = 0
WHERE status = 'SCHEDULED' AND due_at IS NULL;

-- Backfill CALLED and SERVING tickets
UPDATE tickets
SET checkin_at = COALESCE(arrived_at, queue_entered_at, created_at),
    ready_at = COALESCE(arrived_at, queue_entered_at, created_at),
    due_at = COALESCE(scheduled_at, queue_entered_at, created_at),
    source_rank = CASE source WHEN 'APPOINTMENT' THEN 0 WHEN 'QR' THEN 1 ELSE 2 END,
    policy_version = 1,
    recall_count = 0
WHERE status IN ('CALLED', 'SERVING') AND due_at IS NULL;

-- Index for due_at queue ordering:
-- SELECT id FROM tickets WHERE status='WAITING' AND service_id = ANY(:services) AND ready_at <= :now
-- ORDER BY due_at, source_rank, checkin_at, id LIMIT 1 FOR UPDATE SKIP LOCKED;
CREATE INDEX IF NOT EXISTS tickets_waiting_due_at ON tickets(due_at, source_rank, checkin_at, id)
  WHERE status = 'WAITING';

-- Unique partial index: one active ticket per client
CREATE UNIQUE INDEX IF NOT EXISTS tickets_one_active_per_client ON tickets(client_id)
  WHERE status IN ('WAITING', 'CALLED', 'SERVING') AND client_id IS NOT NULL;

-- Index on ticket_events request_id for idempotent call-next lookups
CREATE INDEX IF NOT EXISTS ticket_events_request_id ON ticket_events(request_id)
  WHERE request_id IS NOT NULL;

-- Allow ARRIVED events to transition to WAITING as well as SCHEDULED
ALTER TABLE ticket_events DROP CONSTRAINT IF EXISTS ticket_events_check;
ALTER TABLE ticket_events ADD CONSTRAINT ticket_events_check CHECK (
  (type='CREATED' AND from_status IS NULL AND to_status IN ('WAITING','SCHEDULED') AND window_id IS NULL)
  OR (type='ARRIVED' AND from_status IS NOT NULL AND from_status='SCHEDULED' AND to_status IN ('SCHEDULED','WAITING') AND window_id IS NULL)
  OR (type='CALLED' AND from_status IS NOT NULL AND from_status IN ('WAITING','SCHEDULED','CALLED') AND to_status='CALLED' AND window_id IS NOT NULL)
  OR (type='SERVICE_STARTED' AND from_status IS NOT NULL AND from_status='CALLED' AND to_status='SERVING' AND window_id IS NOT NULL)
  OR (type='COMPLETED' AND from_status IS NOT NULL AND from_status='SERVING' AND to_status='COMPLETED' AND window_id IS NOT NULL)
  OR (type='CANCELLED' AND from_status IS NOT NULL AND from_status IN ('SCHEDULED','WAITING') AND to_status='CANCELLED' AND window_id IS NULL)
  OR (type='NO_SHOW' AND from_status IS NOT NULL AND from_status='CALLED' AND to_status='NO_SHOW' AND window_id IS NOT NULL)
  OR (type IN ('RETURNED','REDIRECTED') AND from_status IS NOT NULL AND from_status IN ('CALLED','SERVING') AND to_status='WAITING')
);

-- Trigger to reject UPDATE/DELETE mutations on ticket_events (append-only audit log)
CREATE OR REPLACE FUNCTION trg_ticket_events_append_only()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'ticket_events is append-only: UPDATE is rejected';
    ELSIF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'ticket_events is append-only: DELETE is rejected';
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ticket_events_no_mutation ON ticket_events;
CREATE TRIGGER trg_ticket_events_no_mutation
BEFORE UPDATE OR DELETE ON ticket_events
FOR EACH ROW EXECUTE FUNCTION trg_ticket_events_append_only();

-- Trigger to synchronize due_at and ready_at when scheduled_at or checkin_at are modified
CREATE OR REPLACE FUNCTION trg_tickets_sync_due_at()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.source = 'APPOINTMENT' THEN
        IF NEW.scheduled_at IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at) THEN
            NEW.due_at := NEW.scheduled_at;
            IF NEW.checkin_at IS NULL THEN
                NEW.ready_at := NEW.scheduled_at - INTERVAL '10 minutes';
            ELSE
                NEW.ready_at := LEAST(NEW.checkin_at, NEW.scheduled_at - INTERVAL '10 minutes');
            END IF;
        END IF;
    ELSE
        -- For QR and LIVE
        IF TG_OP = 'UPDATE' AND NEW.queue_entered_at IS DISTINCT FROM OLD.queue_entered_at THEN
            NEW.checkin_at := COALESCE(NEW.queue_entered_at, NEW.checkin_at, clock_timestamp());
            NEW.ready_at := COALESCE(NEW.queue_entered_at, NEW.ready_at, clock_timestamp());
            NEW.due_at := COALESCE(NEW.queue_entered_at, NEW.due_at, clock_timestamp()) + INTERVAL '30 minutes';
        ELSIF NEW.due_at IS NULL THEN
            NEW.due_at := COALESCE(NEW.checkin_at, NEW.queue_entered_at, clock_timestamp()) + INTERVAL '30 minutes';
            NEW.ready_at := COALESCE(NEW.checkin_at, NEW.queue_entered_at, clock_timestamp());
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tickets_sync_due ON tickets;
CREATE TRIGGER trg_tickets_sync_due
BEFORE INSERT OR UPDATE OF scheduled_at, queue_entered_at, checkin_at ON tickets
FOR EACH ROW EXECUTE FUNCTION trg_tickets_sync_due_at();

