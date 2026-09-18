-- === 000001_initial.up.sql ===
-- Foundation intentionally has no business schema.
SELECT 1;


-- === 000002_sprint1.up.sql ===
CREATE TABLE branches (id uuid PRIMARY KEY, name text NOT NULL);
CREATE TABLE services (id uuid PRIMARY KEY, code text NOT NULL UNIQUE, name text NOT NULL);
CREATE TABLE branch_services (
 branch_id uuid NOT NULL REFERENCES branches(id),
 service_id uuid NOT NULL REFERENCES services(id),
 PRIMARY KEY (branch_id, service_id)
);
CREATE TABLE windows (
 id uuid PRIMARY KEY,
 branch_id uuid NOT NULL REFERENCES branches(id),
 number integer NOT NULL CHECK (number > 0),
 status text NOT NULL CHECK (status IN ('CLOSED','OPEN','CLOSING')),
 UNIQUE (branch_id, number),
 UNIQUE (id, branch_id)
);
CREATE TABLE window_services (
 window_id uuid NOT NULL,
 branch_id uuid NOT NULL,
 service_id uuid NOT NULL,
 PRIMARY KEY (window_id, service_id),
 FOREIGN KEY (window_id, branch_id) REFERENCES windows(id, branch_id),
 FOREIGN KEY (branch_id, service_id) REFERENCES branch_services(branch_id, service_id)
);
CREATE SEQUENCE ticket_public_number_seq;
-- Minimum six digits; nextval is evaluated exactly once and never truncated.
CREATE FUNCTION next_ticket_public_number() RETURNS text LANGUAGE sql VOLATILE AS $$
 SELECT 'Q-' || lpad(n::text, greatest(6, length(n::text)), '0') FROM (SELECT nextval('ticket_public_number_seq') AS n) s
$$;
CREATE TABLE tickets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 public_number text NOT NULL UNIQUE DEFAULT next_ticket_public_number(),
 branch_id uuid NOT NULL,
 service_id uuid NOT NULL,
 source text NOT NULL CHECK (source IN ('APPOINTMENT','QR','LIVE')),
 status text NOT NULL CHECK (status IN ('SCHEDULED','WAITING','CALLED','SERVING','COMPLETED','CANCELLED','NO_SHOW')),
 window_id uuid,
 idempotency_key text NOT NULL UNIQUE CHECK (length(btrim(idempotency_key)) > 0),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 queue_entered_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 called_at timestamptz,
 service_started_at timestamptz,
 completed_at timestamptz,
 FOREIGN KEY (branch_id, service_id) REFERENCES branch_services(branch_id, service_id),
 FOREIGN KEY (window_id, branch_id) REFERENCES windows(id, branch_id),
 FOREIGN KEY (window_id, service_id) REFERENCES window_services(window_id, service_id),
 CHECK (status NOT IN ('CALLED','SERVING','COMPLETED') OR (window_id IS NOT NULL AND called_at IS NOT NULL)),
 CHECK (status NOT IN ('SERVING','COMPLETED') OR service_started_at IS NOT NULL),
 CHECK (status <> 'COMPLETED' OR completed_at IS NOT NULL)
);
CREATE UNIQUE INDEX tickets_one_active_per_window ON tickets(window_id) WHERE status IN ('CALLED','SERVING');
CREATE INDEX tickets_waiting_fifo ON tickets(branch_id, queue_entered_at, id) INCLUDE (service_id) WHERE status = 'WAITING';
CREATE INDEX branch_services_service ON branch_services(service_id);
CREATE INDEX window_services_branch_service ON window_services(branch_id, service_id);
CREATE INDEX tickets_branch_service ON tickets(branch_id, service_id);
CREATE INDEX tickets_window_service ON tickets(window_id, service_id);
INSERT INTO branches VALUES ('11111111-1111-1111-1111-111111111111','Демо-отделение №1');
INSERT INTO services VALUES
 ('22222222-2222-2222-2222-222222222222','PARCELS','Посылки'),
 ('55555555-5555-5555-5555-555555555555','PAYMENTS','Платежи');
INSERT INTO branch_services SELECT '11111111-1111-1111-1111-111111111111', id FROM services;
INSERT INTO windows VALUES
 ('33333333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111',1,'OPEN'),
 ('44444444-4444-4444-4444-444444444444','11111111-1111-1111-1111-111111111111',2,'OPEN'),
 ('66666666-6666-6666-6666-666666666666','11111111-1111-1111-1111-111111111111',3,'OPEN');
INSERT INTO window_services SELECT id, branch_id,
 CASE WHEN number = 2 THEN '55555555-5555-5555-5555-555555555555'::uuid ELSE '22222222-2222-2222-2222-222222222222'::uuid END FROM windows;


-- === 000003_tz2.up.sql ===
ALTER TABLE tickets ADD COLUMN scheduled_at timestamptz;


-- === 000004_priority_rules.up.sql ===
CREATE TABLE priority_rules (
 branch_id uuid NOT NULL REFERENCES branches(id),
 source    text NOT NULL CHECK (source IN ('APPOINTMENT','QR','LIVE')),
 name      text NOT NULL,
 weight    integer NOT NULL CHECK (weight >= 0),
 max_wait_limit_minutes integer NOT NULL CHECK (max_wait_limit_minutes >= 0),
 description text NOT NULL DEFAULT '',
 PRIMARY KEY (branch_id, source)
);

-- Seed default rules for existing demo branch
INSERT INTO priority_rules (branch_id, source, name, weight, max_wait_limit_minutes, description)
VALUES
 ('11111111-1111-1111-1111-111111111111', 'APPOINTMENT', 'Предварительная запись', 100, 5,  'Обслуживаются первыми по времени'),
 ('11111111-1111-1111-1111-111111111111', 'QR',          'QR-код',                 50,  15, 'Живая очередь по коду в отделении'),
 ('11111111-1111-1111-1111-111111111111', 'LIVE',        'Живая очередь',           10,  30, 'Талоны от оператора');


-- === 000005_appointment_policy_events.up.sql ===
-- Ensure scheduled_at column exists and migrate legacy scheduled_time if present.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tickets' AND column_name='scheduled_time')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tickets' AND column_name='scheduled_at') THEN
        ALTER TABLE tickets RENAME COLUMN scheduled_time TO scheduled_at;
    ELSE
        ALTER TABLE tickets ADD COLUMN IF NOT EXISTS scheduled_at timestamptz;
    END IF;
END $$;

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


-- === 000006_sprint3_queue_engine.up.sql ===
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


-- === 000007_branches_extended.up.sql ===
ALTER TABLE branches
  ADD COLUMN IF NOT EXISTS address     text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS work_hours  text NOT NULL DEFAULT '08:00–20:00',
  ADD COLUMN IF NOT EXISTS timezone_offset integer NOT NULL DEFAULT 3;

-- Обновить демо-отделение реальными данными
UPDATE branches
SET address = 'г. Рязань, ул. Ленина, д. 20',
    work_hours = '08:00–20:00',
    timezone_offset = 3
WHERE id = '11111111-1111-1111-1111-111111111111';


-- === 000008_users_auth.up.sql ===
CREATE TABLE IF NOT EXISTS users (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text        NOT NULL UNIQUE,
  password_hash text        NOT NULL,
  role          text        NOT NULL DEFAULT 'client'
    CONSTRAINT users_role_check CHECK (role IN ('client','employee','opc_chief','terminal')),
  is_terminal   boolean     NOT NULL DEFAULT false,
  confirmed     boolean     NOT NULL DEFAULT false,
  confirm_token text,
  created_at    timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS sessions (
  token      text        PRIMARY KEY,
  user_id    uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);

-- Создать тестового admin-пользователя (пароль: admin1234, bcrypt)
-- Хэш bcrypt для "admin1234" cost=12:
-- $2a$10$0PlADjwCyuOVbtw1kGoWGOIOpBcPXULZShPGVabqqlzsYYh4HwqRW
INSERT INTO users (email, password_hash, role, is_terminal, confirmed)
VALUES ('admin@pochta.local', '$2a$10$0PlADjwCyuOVbtw1kGoWGOIOpBcPXULZShPGVabqqlzsYYh4HwqRW', 'opc_chief', false, true)
ON CONFLICT (email) DO NOTHING;


-- === 000009_ui_services.up.sql ===
INSERT INTO services (id, code, name)
VALUES 
  ('33333333-2222-2222-2222-222222222222', 'SEND', 'Отправка писем и посылок'),
  ('44444444-2222-2222-2222-222222222222', 'RETAIL', 'Почтовые товары')
ON CONFLICT (id) DO NOTHING;

INSERT INTO branch_services (branch_id, service_id)
VALUES 
  ('11111111-1111-1111-1111-111111111111', '33333333-2222-2222-2222-222222222222'),
  ('11111111-1111-1111-1111-111111111111', '44444444-2222-2222-2222-222222222222')
ON CONFLICT (branch_id, service_id) DO NOTHING;

INSERT INTO window_services (window_id, branch_id, service_id)
VALUES
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', '33333333-2222-2222-2222-222222222222'),
  ('66666666-6666-6666-6666-666666666666', '11111111-1111-1111-1111-111111111111', '33333333-2222-2222-2222-222222222222'),
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', '44444444-2222-2222-2222-222222222222'),
  ('44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111', '44444444-2222-2222-2222-222222222222'),
  ('66666666-6666-6666-6666-666666666666', '11111111-1111-1111-1111-111111111111', '44444444-2222-2222-2222-222222222222')
ON CONFLICT (window_id, service_id) DO NOTHING;


-- === 000010_seed_operator.up.sql ===
-- Тестовый оператор (пароль: operator1234, bcrypt cost=10)
INSERT INTO users (email, password_hash, role, is_terminal, confirmed)
VALUES ('operator@pochta.local', '$2a$10$9rE.JPFRj5xnpZplKdVRUebVNSl9PSx64nCYvnoU1vIQiFkNVFZYS', 'employee', false, true)
ON CONFLICT (email) DO NOTHING;


-- === 000011_return_redirect_events.up.sql ===
-- Extend audit coverage only; existing immutable events and lifecycle remain unchanged.
ALTER TABLE ticket_events DROP CONSTRAINT ticket_events_type_check, DROP CONSTRAINT ticket_events_check;
ALTER TABLE ticket_events
 ADD CONSTRAINT ticket_events_type_check CHECK (type IN ('CREATED','ARRIVED','CALLED','SERVICE_STARTED','COMPLETED','CANCELLED','NO_SHOW','RETURNED','REDIRECTED')),
 ADD CONSTRAINT ticket_events_check CHECK (
 (type='CREATED' AND from_status IS NULL AND to_status IN ('WAITING','SCHEDULED') AND window_id IS NULL)
 OR (type='ARRIVED' AND from_status IS NOT NULL AND from_status='SCHEDULED' AND to_status='SCHEDULED' AND window_id IS NULL)
 OR (type='CALLED' AND from_status IS NOT NULL AND from_status IN ('WAITING','SCHEDULED') AND to_status='CALLED' AND window_id IS NOT NULL)
 OR (type='SERVICE_STARTED' AND from_status IS NOT NULL AND from_status='CALLED' AND to_status='SERVING' AND window_id IS NOT NULL)
 OR (type='COMPLETED' AND from_status IS NOT NULL AND from_status='SERVING' AND to_status='COMPLETED' AND window_id IS NOT NULL)
 OR (type='CANCELLED' AND from_status IS NOT NULL AND from_status='SCHEDULED' AND to_status='CANCELLED' AND window_id IS NULL)
 OR (type='NO_SHOW' AND from_status IS NOT NULL AND from_status='CALLED' AND to_status='NO_SHOW' AND window_id IS NOT NULL)
 OR (type IN ('RETURNED','REDIRECTED') AND from_status IS NOT NULL AND from_status IN ('CALLED','SERVING') AND to_status='WAITING'));



-- === schema_migrations (golang-migrate compatibility) ===
CREATE TABLE IF NOT EXISTS schema_migrations (
  version bigint NOT NULL PRIMARY KEY,
  dirty boolean NOT NULL
);
INSERT INTO schema_migrations (version, dirty) VALUES (11, false) ON CONFLICT (version) DO NOTHING;
