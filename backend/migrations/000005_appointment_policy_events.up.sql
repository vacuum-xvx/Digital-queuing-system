-- scheduled_at already exists since 000003. Only normalize pending appointments;
-- do not rewrite served/terminal history or backfill events.
UPDATE tickets SET queue_entered_at=scheduled_at, status='SCHEDULED', window_id=NULL
 WHERE source='APPOINTMENT' AND status IN ('WAITING','SCHEDULED') AND scheduled_at IS NOT NULL;
ALTER TABLE tickets ADD CONSTRAINT tickets_scheduled_source CHECK (
 (source='APPOINTMENT' AND scheduled_at IS NOT NULL)
 OR (source<>'APPOINTMENT' AND scheduled_at IS NULL));
ALTER TABLE tickets ADD CONSTRAINT tickets_scheduled_unassigned CHECK (
 source<>'APPOINTMENT' OR status<>'SCHEDULED' OR
 (window_id IS NULL AND queue_entered_at=scheduled_at));
ALTER TABLE tickets ADD CONSTRAINT tickets_cancelled_unassigned CHECK (
 source<>'APPOINTMENT' OR status<>'CANCELLED' OR window_id IS NULL);
-- Durable canonical UTC RFC3339Nano creation input. Retained on down to avoid
-- losing idempotency precision; pre-000005 requests legitimately have NULL.
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS appointment_requested_at text;
CREATE SEQUENCE appointment_public_number_seq;
-- Reconcile only during migration. Ordinary creation always uses nextval.
-- This also handles down/up while retaining tickets and their public numbers.
DO $$
DECLARE highest_number bigint;
BEGIN
 SELECT max(substring(public_number FROM 3)::bigint) INTO highest_number
 FROM tickets WHERE public_number ~ '^A-[0-9]+$';
 IF highest_number > 0 THEN
  PERFORM setval('appointment_public_number_seq', highest_number, true);
 END IF;
END
$$;
CREATE FUNCTION next_appointment_public_number() RETURNS text LANGUAGE sql VOLATILE AS $$
 SELECT 'A-' || lpad(n::text, greatest(6,length(n::text)), '0')
 FROM (SELECT nextval('appointment_public_number_seq') AS n) s
$$;
CREATE TABLE queue_policies (
 branch_id uuid PRIMARY KEY REFERENCES branches(id),
 appointment_due_priority integer NOT NULL CHECK (appointment_due_priority BETWEEN 0 AND 1000),
 qr_priority integer NOT NULL CHECK (qr_priority BETWEEN 0 AND 1000),
 version bigint NOT NULL CHECK (version > 0),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK (appointment_due_priority > qr_priority)
);
INSERT INTO queue_policies(branch_id,appointment_due_priority,qr_priority,version)
 VALUES ('11111111-1111-1111-1111-111111111111',100,10,1);
CREATE TABLE ticket_events (
 id bigserial PRIMARY KEY,
 ticket_id uuid NOT NULL REFERENCES tickets(id),
 type text NOT NULL CHECK(type IN ('CREATED','CALLED','SERVICE_STARTED','COMPLETED','CANCELLED')),
 from_status text,
 to_status text NOT NULL,
 window_id uuid REFERENCES windows(id),
 policy_version bigint,
 decision_priority integer,
 occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK ((type='CREATED' AND from_status IS NULL AND to_status IN ('WAITING','SCHEDULED') AND window_id IS NULL)
 OR (type='CALLED' AND from_status IS NOT NULL AND from_status IN ('WAITING','SCHEDULED') AND to_status='CALLED' AND window_id IS NOT NULL)
 OR (type='SERVICE_STARTED' AND from_status IS NOT NULL AND from_status='CALLED' AND to_status='SERVING' AND window_id IS NOT NULL)
 OR (type='COMPLETED' AND from_status IS NOT NULL AND from_status='SERVING' AND to_status='COMPLETED' AND window_id IS NOT NULL)
 OR (type='CANCELLED' AND from_status IS NOT NULL AND from_status='SCHEDULED' AND to_status='CANCELLED' AND window_id IS NULL)),
 CHECK ((type='CALLED' AND policy_version IS NOT NULL AND policy_version>0 AND decision_priority IS NOT NULL AND decision_priority BETWEEN 0 AND 1000)
 OR (type<>'CALLED' AND policy_version IS NULL AND decision_priority IS NULL))
);
CREATE INDEX ticket_events_chronological ON ticket_events(ticket_id,occurred_at,id);
CREATE INDEX tickets_due_appointments ON tickets(branch_id,scheduled_at,id) INCLUDE(service_id)
 WHERE source='APPOINTMENT' AND status='SCHEDULED';
-- Audit entries cannot be edited through ordinary SQL either.
CREATE FUNCTION reject_ticket_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'ticket events are append-only';
END
$$;
CREATE TRIGGER ticket_events_immutable BEFORE UPDATE OR DELETE ON ticket_events
 FOR EACH ROW EXECUTE FUNCTION reject_ticket_event_mutation();
