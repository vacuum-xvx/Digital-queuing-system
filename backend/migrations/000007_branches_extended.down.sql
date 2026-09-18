ALTER TABLE branches
  DROP COLUMN IF EXISTS address,
  DROP COLUMN IF EXISTS work_hours,
  DROP COLUMN IF EXISTS timezone_offset;
