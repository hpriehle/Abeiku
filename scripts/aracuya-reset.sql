-- F3: reset Aracuya's test data and rooms (DML only; run by hand in the Supabase SQL editor).
--
-- 1. Deletes the 2 test bookings and 2 test conversations of hotel "aracuya" (from Feb 2026,
--    picked by id after a read-only look on 2026-11-15). Their chat messages and conversation
--    events go with them (ON DELETE CASCADE). No reviews, payments or sent templates point
--    at the bookings.
-- 2. Makes Aracuya one listing: hotel_rooms slug "suite", name "Aracuya", 3 identical rooms
--    booked by count, prices and photos as on aracuya.com (src/data/rooms.ts). The 4 old room
--    rows are deactivated, not deleted.
--
-- Every statement is limited to the aracuya hotel id. Safe to run twice.

BEGIN;

-- Stop if the hotel id is not Aracuya's.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM hotels WHERE id = '75218f6b-a953-4b74-b5c8-abd040af21f1' AND slug = 'aracuya'
  ) THEN
    RAISE EXCEPTION 'hotel 75218f6b-… is not aracuya: nothing changed';
  END IF;
END $$;

-- 1a. Test bookings (WhatsApp test flow, 19–21 Feb 2026, unpaid, rooms executive-room / standard-room)
DELETE FROM bookings
WHERE hotel_id = '75218f6b-a953-4b74-b5c8-abd040af21f1'
  AND id IN (
    '5e8609b0-7b2d-4060-9689-f57cf70fca6c',
    'bf82240b-6a9d-4f12-aa6e-dc9d6ebbf9a6'
  );

-- 1b. Test conversations (11 Feb 2026, state booking_pending)
DELETE FROM conversations
WHERE hotel_id = '75218f6b-a953-4b74-b5c8-abd040af21f1'
  AND id IN (
    '36a8ac9c-0801-4261-82d8-c5641c678b4a',
    'bc2670d2-92c1-402a-a77e-dcde52bf4cb5'
  );

-- 2a. The one listing.
INSERT INTO hotel_rooms (
  hotel_id, slug, name, tagline, description, pricing_tiers, total_rooms, size, bed_type,
  occupancy, amenities, airbnb_url, images, room_type, group_id, active, position
) VALUES (
  '75218f6b-a953-4b74-b5c8-abd040af21f1',
  'suite',
  'Aracuya',
  'Where elegance meets tranquility',
  'A sanctuary of refined luxury, Aracuya offers sweeping views and meticulous attention to detail. From the hand-selected furnishings to the curated art collection, every element has been thoughtfully chosen to create an atmosphere of serene sophistication.',
  '[{"rooms": 3, "price": 2000, "label": "Entire House"},
    {"rooms": 2, "price": 1350, "label": "2 Rooms"},
    {"rooms": 1, "price": 700, "label": "1 Room"}]'::jsonb,
  3,
  '85 m²',
  'King',
  2,
  '["Panoramic views", "Marble bathroom", "Rain shower", "Soaking tub", "Mini bar",
    "Nespresso machine", "Complimentary Wi-Fi", "Twice-daily housekeeping", "Pillow menu",
    "In-room safe", "Bathrobes & slippers", "Turndown service"]'::jsonb,
  'https://airbnb.com/h/aracuya',
  '{"hero": "https://aracuya.com/images/rooms/suite/aracuya-living-room.jpg",
    "gallery": ["https://aracuya.com/images/rooms/suite/aracuya-bedroom.jpg",
                "https://aracuya.com/images/rooms/suite/aracuya-stone-bathroom.jpg",
                "https://aracuya.com/images/rooms/suite/aracuya-hallway.jpg",
                "https://aracuya.com/images/rooms/suite/aracuya-windows-over-water.jpg"]}'::jsonb,
  'standard',
  NULL,
  true,
  0
)
ON CONFLICT (hotel_id, slug) DO UPDATE SET
  name = EXCLUDED.name,
  tagline = EXCLUDED.tagline,
  description = EXCLUDED.description,
  pricing_tiers = EXCLUDED.pricing_tiers,
  total_rooms = EXCLUDED.total_rooms,
  size = EXCLUDED.size,
  bed_type = EXCLUDED.bed_type,
  occupancy = EXCLUDED.occupancy,
  amenities = EXCLUDED.amenities,
  airbnb_url = EXCLUDED.airbnb_url,
  images = EXCLUDED.images,
  room_type = EXCLUDED.room_type,
  group_id = NULL,
  active = true,
  position = 0,
  updated_at = now();

-- 2b. The old rooms (aracuya-house, queen-room-1, queen-room-2, king-room): inactive, kept.
UPDATE hotel_rooms
SET active = false, updated_at = now()
WHERE hotel_id = '75218f6b-a953-4b74-b5c8-abd040af21f1'
  AND slug <> 'suite'
  AND active = true;

COMMIT;

-- Check (read-only):
--   SELECT slug, name, total_rooms, room_type, active FROM hotel_rooms
--    WHERE hotel_id = '75218f6b-a953-4b74-b5c8-abd040af21f1' ORDER BY position;
--   SELECT count(*) FROM bookings WHERE hotel_id = '75218f6b-a953-4b74-b5c8-abd040af21f1'
--      AND id IN ('5e8609b0-7b2d-4060-9689-f57cf70fca6c', 'bf82240b-6a9d-4f12-aa6e-dc9d6ebbf9a6');  -- 0
--   SELECT count(*) FROM conversations WHERE hotel_id = '75218f6b-a953-4b74-b5c8-abd040af21f1';
