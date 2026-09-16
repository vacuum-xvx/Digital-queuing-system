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
