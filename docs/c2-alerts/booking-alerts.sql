-- C2 booking alerts: email the hotel (never guests) about new bookings, cancellations and
-- tomorrow's arrivals. Run the whole file in the Supabase SQL editor. Safe to run more
-- than once, and safe before or after supabase-migration-booking-sources.sql.
--
-- Additive only: two columns on bookings, one on hotels, two small bookkeeping tables.
-- Drops nothing. The only existing data it changes:
--   * hotels.alert_email is set for Aracuya (only if it is still empty);
--   * the FIRST time it runs, every existing booking is marked as already alerted, so
--     nothing is sent about bookings that are already there.
-- The code works without this file (it logs "alert columns missing" and sends nothing).

BEGIN;

-- Where booking alerts go. NULL = no alerts for that hotel.
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS alert_email TEXT;

UPDATE hotels
   SET alert_email = 'info@aracuya.com'
 WHERE id = '75218f6b-a953-4b74-b5c8-abd040af21f1'
   AND alert_email IS NULL;

-- When each alert went out for a row (NULL = not yet). The code sets these before it sends
-- (and clears them again if the email fails), so a re-sync never sends twice.
-- Marking existing rows happens only when the columns are first added, so running this
-- file again later can't swallow an alert that is still waiting to go out.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'alert_new_sent_at'
  ) THEN
    ALTER TABLE bookings ADD COLUMN alert_new_sent_at TIMESTAMPTZ;
    UPDATE bookings SET alert_new_sent_at = now();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'alert_cancel_sent_at'
  ) THEN
    ALTER TABLE bookings ADD COLUMN alert_cancel_sent_at TIMESTAMPTZ;
    UPDATE bookings SET alert_cancel_sent_at = now() WHERE booking_status = 'cancelled';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_bookings_alert_new_pending
  ON bookings(hotel_id) WHERE alert_new_sent_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_alert_cancel_pending
  ON bookings(hotel_id) WHERE alert_cancel_sent_at IS NULL AND booking_status = 'cancelled';

-- Booking feeds (google_calendar, airbnb, vrbo, booking_com) that have synced at least once.
-- A feed's first sync imports its whole history; those rows are marked without an email.
CREATE TABLE IF NOT EXISTS booking_alert_feeds (
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  feed TEXT NOT NULL,
  first_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (hotel_id, feed)
);

-- If the booking sync already ran before this file, the feeds that have rows count as synced.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'source'
  ) THEN
    EXECUTE $q$
      INSERT INTO booking_alert_feeds (hotel_id, feed)
      SELECT DISTINCT hotel_id, source FROM bookings
       WHERE source IN ('google_calendar', 'airbnb', 'vrbo', 'booking_com')
      ON CONFLICT (hotel_id, feed) DO NOTHING
    $q$;
  END IF;
END $$;

-- One row per digest sent (e.g. kind 'arrivals', for_date = the arrival day), so the daily
-- digest goes out once per date even if the scheduler fires twice.
CREATE TABLE IF NOT EXISTS booking_alert_digests (
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  for_date DATE NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (hotel_id, kind, for_date)
);

-- Server-only tables (the app uses the service role key).
ALTER TABLE booking_alert_feeds ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_alert_digests ENABLE ROW LEVEL SECURITY;

COMMIT;

-- Make PostgREST see the new columns/tables right away.
NOTIFY pgrst, 'reload schema';

-- Check (read-only):
--   SELECT slug, alert_email FROM hotels WHERE alert_email IS NOT NULL;
--   SELECT count(*) FILTER (WHERE alert_new_sent_at IS NULL) AS waiting_new,
--          count(*) FILTER (WHERE booking_status = 'cancelled' AND alert_cancel_sent_at IS NULL) AS waiting_cancel
--     FROM bookings;            -- both 0 right after the first run
--   SELECT * FROM booking_alert_feeds;
