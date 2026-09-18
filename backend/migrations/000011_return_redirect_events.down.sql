-- Refuse to discard audit facts when rolling back an already-used extension.
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM ticket_events WHERE type IN ('RETURNED','REDIRECTED')) THEN
  RAISE EXCEPTION 'cannot downgrade audit constraints while Sprint 4 events exist';
 END IF;
END $$;
ALTER TABLE ticket_events DROP CONSTRAINT ticket_events_type_check, DROP CONSTRAINT ticket_events_check;
ALTER TABLE ticket_events
 ADD CONSTRAINT ticket_events_type_check CHECK (type IN ('CREATED','ARRIVED','CALLED','SERVICE_STARTED','COMPLETED','CANCELLED','NO_SHOW')),
 ADD CONSTRAINT ticket_events_check CHECK (
 (type='CREATED' AND from_status IS NULL AND to_status IN ('WAITING','SCHEDULED') AND window_id IS NULL)
 OR (type='ARRIVED' AND from_status IS NOT NULL AND from_status='SCHEDULED' AND to_status='SCHEDULED' AND window_id IS NULL)
 OR (type='CALLED' AND from_status IS NOT NULL AND from_status IN ('WAITING','SCHEDULED') AND to_status='CALLED' AND window_id IS NOT NULL)
 OR (type='SERVICE_STARTED' AND from_status IS NOT NULL AND from_status='CALLED' AND to_status='SERVING' AND window_id IS NOT NULL)
 OR (type='COMPLETED' AND from_status IS NOT NULL AND from_status='SERVING' AND to_status='COMPLETED' AND window_id IS NOT NULL)
 OR (type='CANCELLED' AND from_status IS NOT NULL AND from_status='SCHEDULED' AND to_status='CANCELLED' AND window_id IS NULL)
 OR (type='NO_SHOW' AND from_status IS NOT NULL AND from_status='CALLED' AND to_status='NO_SHOW' AND window_id IS NOT NULL));
