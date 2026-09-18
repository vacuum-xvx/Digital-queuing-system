-- Sprint 3: Expanded branches schema and users role management

ALTER TABLE branches
  ADD COLUMN IF NOT EXISTS address TEXT NOT NULL DEFAULT 'г. Рязань, ул. Почтовая, д. 49',
  ADD COLUMN IF NOT EXISTS work_hours TEXT NOT NULL DEFAULT '08:00 – 20:00',
  ADD COLUMN IF NOT EXISTS close_time TEXT NOT NULL DEFAULT '20:00',
  ADD COLUMN IF NOT EXISTS timezone_offset INTEGER NOT NULL DEFAULT 3;

UPDATE branches
SET name = 'ОПС 390000 (Рязань Главпочтамт)',
    address = 'г. Рязань, ул. Почтовая, д. 49',
    work_hours = '08:00 – 20:00',
    close_time = '20:00',
    timezone_offset = 3
WHERE id = '11111111-1111-1111-1111-111111111111';

INSERT INTO branches (id, name, address, work_hours, close_time, timezone_offset) VALUES
  ('10100000-0000-0000-0000-000000000001', 'ОПС 101000 (Москва Главпочтамт)', 'г. Москва, ул. Мясницкая, д. 26', '08:00 – 22:00', '22:00', 3),
  ('19000000-0000-0000-0000-000000000002', 'ОПС 190000 (СПб Главпочтамт)', 'г. Санкт-Петербург, ул. Почтамтская, д. 9', '08:00 – 20:00', '20:00', 3)
ON CONFLICT (id) DO NOTHING;

INSERT INTO branch_services (branch_id, service_id)
SELECT b.id, s.id
FROM branches b
CROSS JOIN services s
ON CONFLICT DO NOTHING;

INSERT INTO windows (id, branch_id, number, status) VALUES
  ('a1010000-0000-0000-0000-000000000001', '10100000-0000-0000-0000-000000000001', 1, 'OPEN'),
  ('a1010000-0000-0000-0000-000000000002', '10100000-0000-0000-0000-000000000001', 2, 'OPEN'),
  ('b1900000-0000-0000-0000-000000000001', '19000000-0000-0000-0000-000000000002', 1, 'OPEN'),
  ('b1900000-0000-0000-0000-000000000002', '19000000-0000-0000-0000-000000000002', 2, 'OPEN')
ON CONFLICT DO NOTHING;

INSERT INTO window_services (window_id, branch_id, service_id)
SELECT w.id, w.branch_id, bs.service_id
FROM windows w
JOIN branch_services bs ON bs.branch_id = w.branch_id
ON CONFLICT DO NOTHING;

INSERT INTO queue_policies (branch_id, appointment_due_priority, qr_priority, live_priority,
  anti_starvation_threshold_minutes, anti_starvation_points_per_minute,
  appointment_grace_minutes, appointment_late_penalty_per_minute, appointment_late_penalty_max_points, version)
VALUES
  ('10100000-0000-0000-0000-000000000001', 100, 10, 10, 15, 10, 15, 5, 90, 1),
  ('19000000-0000-0000-0000-000000000002', 100, 10, 10, 15, 10, 15, 5, 90, 1)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('client', 'employee', 'opc_chief', 'terminal')),
  branch_id UUID REFERENCES branches(id) ON DELETE RESTRICT,
  is_terminal BOOLEAN NOT NULL DEFAULT FALSE,
  device_token TEXT UNIQUE,
  confirmation_code_hash TEXT,
  code_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_branch_role ON users(branch_id, role);
CREATE INDEX IF NOT EXISTS idx_users_device_token ON users(device_token) WHERE is_terminal = TRUE;

-- Pre-seed demo users for verification:
-- Passcode for demo users is standard "123456"
-- SHA-256 of "123456": 8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92
INSERT INTO users (id, email, role, branch_id, is_terminal, device_token, confirmation_code_hash, code_expires_at) VALUES
  ('c1111111-1111-1111-1111-111111111111', 'client@pochta.ru', 'client', '11111111-1111-1111-1111-111111111111', FALSE, NULL, '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', clock_timestamp() + interval '30 days'),
  ('e2222222-2222-2222-2222-222222222222', 'operator@pochta.ru', 'employee', '11111111-1111-1111-1111-111111111111', FALSE, NULL, '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', clock_timestamp() + interval '30 days'),
  ('a3333333-3333-3333-3333-333333333333', 'chief@pochta.ru', 'opc_chief', '11111111-1111-1111-1111-111111111111', FALSE, NULL, '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', clock_timestamp() + interval '30 days'),
  ('d4444444-4444-4444-4444-444444444444', 'terminal-390000@pochta.ru', 'terminal', '11111111-1111-1111-1111-111111111111', TRUE, 'term_ops390000_token_secret', '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', clock_timestamp() + interval '30 days')
ON CONFLICT (email) DO NOTHING;
