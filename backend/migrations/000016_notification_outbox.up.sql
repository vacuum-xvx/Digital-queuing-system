-- 000016_notification_outbox.up.sql
-- Notification outbox for reliable asynchronous delivery without blocking queue operations

CREATE TABLE IF NOT EXISTS notification_outbox (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id       uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    branch_id       uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    event_type      text NOT NULL,
    payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
    status          text NOT NULL DEFAULT 'PENDING'
        CONSTRAINT notification_outbox_status_check CHECK (status IN ('PENDING', 'SENT', 'FAILED')),
    attempts        int NOT NULL DEFAULT 0,
    max_attempts    int NOT NULL DEFAULT 3,
    next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    created_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
    sent_at         timestamptz,
    last_error      text
);

CREATE INDEX IF NOT EXISTS notification_outbox_pending_idx
    ON notification_outbox(status, next_attempt_at)
    WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS notification_outbox_ticket_idx
    ON notification_outbox(ticket_id);
