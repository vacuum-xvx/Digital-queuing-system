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
