-- Restore the historical constraint as NOT VALID: rollback must succeed even when a
-- capability was already dropped while tickets still reference the (window, service)
-- pair. The restored constraint validates new writes again.
ALTER TABLE tickets ADD CONSTRAINT tickets_window_id_service_id_fkey
 FOREIGN KEY (window_id, service_id) REFERENCES window_services(window_id, service_id) NOT VALID;
