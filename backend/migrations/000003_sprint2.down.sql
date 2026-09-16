DROP INDEX IF EXISTS tickets_priority_fifo;
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_scheduled_time_check;
ALTER TABLE tickets DROP COLUMN IF EXISTS scheduled_time;
