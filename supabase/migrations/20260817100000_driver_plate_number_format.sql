-- ============================================
-- Enforce Gabonese license plate format (GA-1234-LB)
-- at the DB level, mirroring the zod validation added
-- to the driver registration form.
-- ============================================

ALTER TABLE public.drivers
  DROP CONSTRAINT IF EXISTS drivers_plate_number_format;

ALTER TABLE public.drivers
  ADD CONSTRAINT drivers_plate_number_format
  CHECK (plate_number IS NULL OR plate_number ~ '^[A-Z]{2}-[0-9]{4}-[A-Z]{2}$');
