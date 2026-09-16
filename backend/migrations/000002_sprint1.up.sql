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
