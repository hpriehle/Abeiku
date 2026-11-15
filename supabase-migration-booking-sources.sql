-- Booking sources: keep every hotel booking in `bookings`, wherever it was made
-- (hotel website, Google booking calendar, Airbnb / VRBO / Booking.com iCal feeds).
--
-- Additive and safe to run more than once: adds nullable columns, a check, a unique
-- key and an index; relaxes NOT NULL on phone. Drops nothing, changes no existing data.
-- Run the whole file in the Supabase SQL editor BEFORE deploying the code that uses it
-- (the booking report endpoint, /api/cron/booking-sync and the lifecycle filter need it).

BEGIN;

-- Where the booking came from. NULL = made in Abeiku (WhatsApp bot / admin) before this column.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS source TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookings_source_check') THEN
    ALTER TABLE bookings ADD CONSTRAINT bookings_source_check CHECK (
      source IS NULL OR source IN (
        'aracuya_web', 'google_calendar', 'airbnb', 'vrbo', 'booking_com', 'manual', 'whatsapp'
      )
    );
  END IF;
END $$;

-- The booking's id in its source: website booking ref, Google event id, iCal UID.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS external_ref TEXT;

-- One row per (hotel, source, external ref). Rows with a NULL source or ref are not constrained.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookings_source_external_ref_key') THEN
    ALTER TABLE bookings
      ADD CONSTRAINT bookings_source_external_ref_key UNIQUE (hotel_id, source, external_ref);
  END IF;
END $$;

-- Guest details the website sends; NULL when unknown (calendar blocks, OTA feeds).
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS guest_email TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS guests INTEGER;

-- Partner ref code and payment time reported by the website (the commission itself stays
-- in referral_bookings).
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS ref_code TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

-- Calendar blocks and OTA bookings have no phone number.
ALTER TABLE bookings ALTER COLUMN phone DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_hotel_source ON bookings(hotel_id, source);

COMMIT;

-- Check (read-only):
--   SELECT column_name, is_nullable FROM information_schema.columns
--    WHERE table_name = 'bookings' AND column_name IN
--      ('source','external_ref','guest_email','guests','ref_code','paid_at','phone');
