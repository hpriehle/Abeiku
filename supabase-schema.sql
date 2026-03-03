-- Abeiku Multi-Tenant SaaS Schema
-- Run this in Supabase SQL Editor to create all tables.

-- Hotels — tenant anchor, config + credentials
CREATE TABLE hotels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  contact_phone TEXT,
  contact_email TEXT,
  location_lat DOUBLE PRECISION,
  location_lng DOUBLE PRECISION,
  location_city TEXT,
  location_country TEXT,
  check_in_time TEXT NOT NULL DEFAULT '14:00',
  check_out_time TEXT NOT NULL DEFAULT '11:00',
  wifi_password TEXT,
  currency TEXT NOT NULL DEFAULT 'GHS',
  referral_discount_percent INTEGER NOT NULL DEFAULT 10,
  fee_type TEXT NOT NULL DEFAULT 'flat' CHECK (fee_type IN ('flat', 'percentage')),
  fee_value NUMERIC(10,2) NOT NULL DEFAULT 20.00,
  momo_phone TEXT,
  momo_phone_verified BOOLEAN NOT NULL DEFAULT FALSE,
  momo_verification_amount INTEGER,
  momo_verification_ref TEXT,
  momo_verification_attempts INTEGER NOT NULL DEFAULT 0,
  momo_verification_sent_at TIMESTAMPTZ,
  room_service_menu JSONB DEFAULT '[]'::jsonb,
  local_recommendations JSONB DEFAULT '[]'::jsonb,
  greeting_message TEXT,
  billing_plan TEXT NOT NULL DEFAULT 'free',
  whatsapp_access_token TEXT,
  whatsapp_phone_number_id TEXT,
  whatsapp_verify_token TEXT,
  whatsapp_waba_id TEXT,
  whatsapp_display_phone TEXT,
  stripe_secret_key TEXT,
  stripe_webhook_secret TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_hotels_slug ON hotels(slug);
CREATE UNIQUE INDEX idx_hotels_whatsapp_phone ON hotels(whatsapp_phone_number_id)
  WHERE whatsapp_phone_number_id IS NOT NULL;

-- Admin users — per-hotel login accounts
CREATE TABLE admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_admin_users_hotel ON admin_users(hotel_id);
CREATE INDEX idx_admin_users_email ON admin_users(email);

-- Hotel rooms — replaces static src/data/rooms.ts
-- room_type: 'standard' = classic room type with count-based inventory
--            'group'    = whole-unit listing (e.g. "Entire House")
--            'individual' = specific room within a group
CREATE TABLE hotel_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  tagline TEXT,
  description TEXT,
  pricing_tiers JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_rooms INTEGER NOT NULL DEFAULT 1,
  size TEXT,
  bed_type TEXT,
  occupancy INTEGER NOT NULL DEFAULT 2,
  amenities JSONB DEFAULT '[]'::jsonb,
  airbnb_url TEXT,
  images JSONB DEFAULT '{}'::jsonb,
  calendar_id TEXT,
  room_type TEXT NOT NULL DEFAULT 'standard',
  group_id UUID,
  active BOOLEAN NOT NULL DEFAULT true,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(hotel_id, slug)
);

-- Self-referential FK for group membership (added after table creation)
ALTER TABLE hotel_rooms ADD CONSTRAINT fk_hotel_rooms_group
  FOREIGN KEY (group_id) REFERENCES hotel_rooms(id) ON DELETE SET NULL;

CREATE INDEX idx_hotel_rooms_hotel ON hotel_rooms(hotel_id);
CREATE INDEX idx_hotel_rooms_group ON hotel_rooms(group_id) WHERE group_id IS NOT NULL;

-- Conversations — per-hotel guest conversations
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  guest_name TEXT,
  guest_state TEXT NOT NULL DEFAULT 'lead',
  step TEXT NOT NULL DEFAULT 'idle',
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(hotel_id, phone)
);

CREATE INDEX idx_conversations_hotel_phone ON conversations(hotel_id, phone);

-- Bookings
CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  guest_name TEXT NOT NULL,
  room_slug TEXT NOT NULL,
  rooms_count INTEGER NOT NULL DEFAULT 1,
  check_in DATE NOT NULL,
  check_out DATE NOT NULL,
  total_price NUMERIC(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'GHS',
  payment_status TEXT NOT NULL DEFAULT 'unpaid',
  payment_provider TEXT,
  booking_status TEXT NOT NULL DEFAULT 'confirmed',
  calendar_event_id TEXT,
  booking_group_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_bookings_hotel ON bookings(hotel_id);
CREATE INDEX idx_bookings_hotel_phone ON bookings(hotel_id, phone);
CREATE INDEX idx_bookings_status ON bookings(hotel_id, booking_status);
CREATE INDEX idx_bookings_checkin ON bookings(hotel_id, check_in);
CREATE INDEX idx_bookings_checkout ON bookings(hotel_id, check_out);
CREATE INDEX idx_bookings_group ON bookings(booking_group_id) WHERE booking_group_id IS NOT NULL;

-- Reviews
CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  feedback TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_reviews_hotel ON reviews(hotel_id);
CREATE INDEX idx_reviews_booking ON reviews(booking_id);

-- Templates sent — lifecycle message tracking
CREATE TABLE templates_sent (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  phone TEXT NOT NULL,
  template_type TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_templates_hotel ON templates_sent(hotel_id);
CREATE INDEX idx_templates_booking_type ON templates_sent(booking_id, template_type);
CREATE INDEX idx_templates_phone_type ON templates_sent(hotel_id, phone, template_type);

-- Payments
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_tx_id TEXT,
  amount NUMERIC(10,2) NOT NULL,
  platform_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
  hotel_amount NUMERIC(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'GHS',
  status TEXT NOT NULL DEFAULT 'pending',
  provider_status TEXT,
  phone TEXT,
  momo_phone TEXT,
  disbursement_status TEXT DEFAULT 'pending',
  disbursement_reference_id TEXT,
  disbursement_error TEXT,
  stripe_payment_link_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payments_hotel ON payments(hotel_id);
CREATE INDEX idx_payments_booking ON payments(booking_id);
CREATE INDEX idx_payments_provider_tx ON payments(provider_tx_id);
CREATE INDEX idx_payments_stripe_link ON payments(stripe_payment_link_id);

-- Disbursements — tracks payouts to hotels
CREATE TABLE disbursements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL,
  recipient_phone TEXT NOT NULL,
  mtn_reference_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_disbursements_payment ON disbursements(payment_id);
CREATE INDEX idx_disbursements_status ON disbursements(status);
CREATE INDEX idx_disbursements_hotel ON disbursements(hotel_id);

-- Platform earnings — tracks platform fee per payment
CREATE TABLE platform_earnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL,
  fee_type TEXT NOT NULL,
  fee_value NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_platform_earnings_hotel ON platform_earnings(hotel_id);

-- Wake-up calls
CREATE TABLE wakeup_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  scheduled_date DATE NOT NULL,
  scheduled_time TEXT NOT NULL,
  sent BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_wakeup_hotel_date ON wakeup_calls(hotel_id, scheduled_date, scheduled_time, sent);

-- OAuth tokens
CREATE TABLE oauth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'google',
  scope TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  calendar_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(hotel_id, provider)
);

-- Referral codes
CREATE TABLE referral_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  code TEXT UNIQUE NOT NULL,
  referrer_phone TEXT NOT NULL,
  discount_percent INTEGER NOT NULL DEFAULT 10,
  uses INTEGER NOT NULL DEFAULT 0,
  max_uses INTEGER NOT NULL DEFAULT 5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_referral_code ON referral_codes(code);
CREATE INDEX idx_referral_hotel_phone ON referral_codes(hotel_id, referrer_phone);

-- Enable RLS on all tables
ALTER TABLE hotels ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE hotel_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates_sent ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE wakeup_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE disbursements ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_earnings ENABLE ROW LEVEL SECURITY;

-- Seed Aracuya hotel
INSERT INTO hotels (
  name, slug, contact_phone, contact_email,
  location_lat, location_lng, location_city, location_country,
  check_in_time, check_out_time, currency,
  whatsapp_display_phone,
  room_service_menu, local_recommendations,
  greeting_message
) VALUES (
  'Aracuya', 'aracuya', '+233551542355', 'aracuyagh@gmail.com',
  5.6037, -0.1870, 'Accra', 'Ghana',
  '14:00', '11:00', 'GHS',
  '233551542355',
  '[
    {"category":"Breakfast (6am - 10am)","items":[
      {"name":"Continental Breakfast","price":35},
      {"name":"Full English Breakfast","price":45},
      {"name":"Fresh Fruit Platter","price":25}
    ]},
    {"category":"Light Bites","items":[
      {"name":"Club Sandwich","price":30},
      {"name":"Jollof Rice with Chicken","price":40},
      {"name":"Garden Salad","price":20}
    ]},
    {"category":"Drinks","items":[
      {"name":"Fresh Juice","price":15},
      {"name":"Coffee / Tea","price":10},
      {"name":"Bottled Water","price":5}
    ]},
    {"category":"Extras","items":[
      {"name":"Extra Towels","price":0},
      {"name":"Extra Pillows","price":0}
    ]}
  ]'::jsonb,
  '[
    {"category":"Dining","items":[
      {"name":"Buka Restaurant","description":"Authentic Ghanaian cuisine","distance":"5 min walk"},
      {"name":"Skybar 25","description":"Rooftop dining with city views","distance":"10 min drive"}
    ]},
    {"category":"Activities","items":[
      {"name":"Labadi Beach","description":"Ghana''s most popular beach","distance":"15 min drive"},
      {"name":"Kwame Nkrumah Memorial","description":"Historic landmark","distance":"10 min drive"},
      {"name":"Artists Alliance Gallery","description":"Local art & crafts","distance":"10 min drive"}
    ]},
    {"category":"Shopping","items":[
      {"name":"Accra Mall","description":"Modern shopping centre","distance":"15 min drive"},
      {"name":"Makola Market","description":"Traditional market experience","distance":"10 min drive"}
    ]}
  ]'::jsonb,
  NULL
);

-- Seed Aracuya rooms — group listing + 3 individual rooms
-- 1) Group listing: "Aracuya House" (the whole-house option)
INSERT INTO hotel_rooms (
  hotel_id, slug, name, tagline, description,
  pricing_tiers, total_rooms, size, bed_type, occupancy,
  amenities, airbnb_url, images, room_type, position
) VALUES (
  (SELECT id FROM hotels WHERE slug = 'aracuya'),
  'aracuya-house', 'Aracuya House', 'Where elegance meets tranquility',
  'A sanctuary of refined luxury, Aracuya offers sweeping views and meticulous attention to detail. Book the entire 3-bedroom house for a private retreat with your family or group.',
  '[{"rooms":1,"price":100,"label":"Entire House"}]'::jsonb,
  1, '85 m²', NULL, 6,
  '["Panoramic views","Marble bathroom","Rain shower","Soaking tub","Mini bar","Nespresso machine","Complimentary Wi-Fi","Twice-daily housekeeping","Pillow menu","In-room safe","Bathrobes & slippers","Turndown service"]'::jsonb,
  'https://airbnb.com/h/aracuya',
  '{"hero":"/images/rooms/suite/hero.jpg","gallery":["/images/rooms/suite/gallery-1.jpg","/images/rooms/suite/gallery-2.jpg","/images/rooms/suite/gallery-3.jpg","/images/rooms/suite/gallery-4.jpg"]}'::jsonb,
  'group', 0
);

-- 2) Individual room: Queen Room 1
INSERT INTO hotel_rooms (
  hotel_id, slug, name, tagline, description,
  pricing_tiers, total_rooms, size, bed_type, occupancy,
  amenities, images, room_type, group_id, position
) VALUES (
  (SELECT id FROM hotels WHERE slug = 'aracuya'),
  'queen-room-1', 'Queen Room 1', 'Cozy queen bedroom',
  'A comfortable queen bedroom in the Aracuya house. Book individually for a shared-space stay or combine with other rooms.',
  '[{"rooms":1,"price":50,"label":"Queen Room"}]'::jsonb,
  1, NULL, 'Queen', 2,
  '["Complimentary Wi-Fi","In-room safe","Bathrobes & slippers"]'::jsonb,
  '{}'::jsonb,
  'individual',
  (SELECT id FROM hotel_rooms WHERE slug = 'aracuya-house' AND hotel_id = (SELECT id FROM hotels WHERE slug = 'aracuya')),
  1
);

-- 3) Individual room: Queen Room 2
INSERT INTO hotel_rooms (
  hotel_id, slug, name, tagline, description,
  pricing_tiers, total_rooms, size, bed_type, occupancy,
  amenities, images, room_type, group_id, position
) VALUES (
  (SELECT id FROM hotels WHERE slug = 'aracuya'),
  'queen-room-2', 'Queen Room 2', 'Cozy queen bedroom',
  'A comfortable queen bedroom in the Aracuya house. Book individually for a shared-space stay or combine with other rooms.',
  '[{"rooms":1,"price":50,"label":"Queen Room"}]'::jsonb,
  1, NULL, 'Queen', 2,
  '["Complimentary Wi-Fi","In-room safe","Bathrobes & slippers"]'::jsonb,
  '{}'::jsonb,
  'individual',
  (SELECT id FROM hotel_rooms WHERE slug = 'aracuya-house' AND hotel_id = (SELECT id FROM hotels WHERE slug = 'aracuya')),
  2
);

-- 4) Individual room: King Room
INSERT INTO hotel_rooms (
  hotel_id, slug, name, tagline, description,
  pricing_tiers, total_rooms, size, bed_type, occupancy,
  amenities, images, room_type, group_id, position
) VALUES (
  (SELECT id FROM hotels WHERE slug = 'aracuya'),
  'king-room', 'King Room', 'Spacious king bedroom',
  'A luxurious king bedroom in the Aracuya house. The largest room with premium furnishings and panoramic views.',
  '[{"rooms":1,"price":60,"label":"King Room"}]'::jsonb,
  1, NULL, 'King', 2,
  '["Panoramic views","Complimentary Wi-Fi","In-room safe","Bathrobes & slippers"]'::jsonb,
  '{}'::jsonb,
  'individual',
  (SELECT id FROM hotel_rooms WHERE slug = 'aracuya-house' AND hotel_id = (SELECT id FROM hotels WHERE slug = 'aracuya')),
  3
);
