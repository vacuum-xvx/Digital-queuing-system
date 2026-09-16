ALTER TABLE tickets ADD COLUMN scheduled_time timestamptz;

ALTER TABLE tickets ADD CONSTRAINT tickets_scheduled_time_check
  CHECK (source <> 'APPOINTMENT' OR scheduled_time IS NOT NULL);

CREATE INDEX tickets_priority_fifo ON tickets(branch_id, status, queue_entered_at, scheduled_time)
  WHERE status IN ('SCHEDULED', 'WAITING');
