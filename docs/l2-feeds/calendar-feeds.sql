-- L2 feeds: each hotel's own calendar links (Airbnb / Booking.com / VRBO iCal, Google
-- calendar ID), read by the booking sync every 15 minutes, edited on Settings > Calendars.
-- Run the whole file in the Supabase SQL editor. Safe to run more than once.
--
-- Run AFTER supabase-migration-booking-sources.sql (bookings.source / external_ref) and
-- docs/l2-signup/billing.sql (hotels.calendar_links). Order with docs/c2-alerts doesn't matter.
--
-- Additive only: one new table and one new nullable column on bookings. Drops nothing.
-- The only data it writes: links that hotels entered at sign-up (hotels.calendar_links) are
-- copied into the new table, once per link. Aracuya is never touched (its feeds stay in env).
-- The code works without this file: the sync skips other hotels, the Calendars screen says
-- "not ready yet", sign-up keeps storing links in hotels.calendar_links only.

BEGIN;

CREATE TABLE IF NOT EXISTS hotel_calendar_feeds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  -- airbnb | booking_com | vrbo (iCal link in url) or google_calendar (calendar ID in url)
  kind TEXT NOT NULL CHECK (kind IN ('airbnb', 'booking_com', 'vrbo', 'google_calendar')),
  url TEXT NOT NULL CHECK (length(url) <= 1000),
  -- hotel_rooms.slug this feed blocks, or NULL for the whole property
  room_slug TEXT,
  last_synced_at TIMESTAMPTZ,
  last_count INTEGER,
  last_error TEXT,
  last_error_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS hotel_calendar_feeds_hotel_url_key
  ON hotel_calendar_feeds (hotel_id, lower(url));

ALTER TABLE hotel_calendar_feeds ENABLE ROW LEVEL SECURITY;

-- Which feed a synced booking came from. NULL for Aracuya's env feeds and every other row.
-- When a feed is removed its rows keep their history (feed_id becomes NULL).
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS feed_id UUID REFERENCES hotel_calendar_feeds(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS bookings_feed_id_idx ON bookings (feed_id) WHERE feed_id IS NOT NULL;

-- Copy sign-up links in (whole property). Skips Aracuya, empty links and links already there.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'hotels' AND column_name = 'calendar_links'
  ) THEN
    INSERT INTO hotel_calendar_feeds (hotel_id, kind, url)
    SELECT h.id, l.kind, l.url
      FROM hotels h
     CROSS JOIN LATERAL (VALUES
       ('airbnb',          NULLIF(trim(h.calendar_links->>'airbnb'), '')),
       ('booking_com',     NULLIF(trim(h.calendar_links->>'booking'), '')),
       ('vrbo',            NULLIF(trim(h.calendar_links->>'vrbo'), '')),
       ('google_calendar', NULLIF(trim(h.calendar_links->>'google'), ''))
     ) AS l(kind, url)
     WHERE h.calendar_links IS NOT NULL
       AND h.slug <> 'aracuya'
       AND l.url IS NOT NULL
       AND length(l.url) <= 1000
    ON CONFLICT (hotel_id, lower(url)) DO NOTHING;
  END IF;
END $$;

COMMIT;

-- Make PostgREST see the new table and column right away.
NOTIFY pgrst, 'reload schema';

-- Check (read-only):
-- SELECT h.slug, f.kind, f.room_slug, f.last_synced_at, f.last_count, f.last_error
--   FROM hotel_calendar_feeds f JOIN hotels h ON h.id = f.hotel_id ORDER BY h.slug, f.created_at;
-- SELECT count(*) FROM bookings WHERE feed_id IS NOT NULL;
