ALTER TABLE branches
  ADD COLUMN IF NOT EXISTS address     text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS work_hours  text NOT NULL DEFAULT '08:00–20:00',
  ADD COLUMN IF NOT EXISTS timezone_offset integer NOT NULL DEFAULT 3;

-- Обновить демо-отделение реальными данными
UPDATE branches
SET address = 'г. Рязань, ул. Ленина, д. 20',
    work_hours = '08:00–20:00',
    timezone_offset = 3
WHERE id = '11111111-1111-1111-1111-111111111111';
