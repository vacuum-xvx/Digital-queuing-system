-- 000019_ticket_management_and_requeue.up.sql
-- Add secure management token hash for ticket cancellation authorization and requeued_at for appointment queue cycles
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS management_token_hash text,
  ADD COLUMN IF NOT EXISTS requeued_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_tickets_management_token_hash
  ON tickets(management_token_hash)
  WHERE management_token_hash IS NOT NULL;
