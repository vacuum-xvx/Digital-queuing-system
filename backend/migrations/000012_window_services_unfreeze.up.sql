-- Operators must always be able to drop a window capability, even when the window
-- already served tickets of that service. The composite foreign key from tickets to
-- window_services was the only blocker: it froze historical capabilities in place and
-- made DELETE FROM window_services fail with SQLSTATE 23503. Ticket integrity stays
-- protected by the remaining tickets foreign keys — (window_id, branch_id) references
-- windows(id, branch_id) and (branch_id, service_id) references
-- branch_services(branch_id, service_id) — while the historical (window, service)
-- pair remains visible in tickets and ticket_events.
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_window_id_service_id_fkey;
