-- 000019_ticket_management_and_requeue.down.sql
DROP INDEX IF EXISTS idx_tickets_management_token_hash;
ALTER TABLE tickets
  DROP COLUMN IF EXISTS management_token_hash,
  DROP COLUMN IF EXISTS requeued_at;
