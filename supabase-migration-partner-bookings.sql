-- Partner bookings + commission tracking (Aracuya affiliate scope)
-- Run AFTER supabase-migration-influencers.sql.
--
-- An "influencer" row is now a partner of any type. Its slug is the partner's
-- ref code (aracuya.com/?ref=CODE): stored lowercase, unique per hotel.

-- 1. Partner fields on influencers
ALTER TABLE influencers
  ADD COLUMN partner_type TEXT NOT NULL DEFAULT 'influencer'
    CHECK (partner_type IN ('agency', 'local', 'influencer')),
  ADD COLUMN country TEXT NOT NULL DEFAULT 'Ghana',
  ADD COLUMN currency TEXT NOT NULL DEFAULT 'GHS'
    CHECK (currency IN ('GHS', 'USD')),
  ADD COLUMN commission_kind TEXT NOT NULL DEFAULT 'percent'
    CHECK (commission_kind IN ('percent', 'per_night')),
  -- percent: 15 means 15%. per_night: amount per night in commission_currency.
  ADD COLUMN commission_value NUMERIC(12,2) NOT NULL DEFAULT 0
    CHECK (commission_value >= 0),
  ADD COLUMN commission_currency TEXT NOT NULL DEFAULT 'GHS'
    CHECK (commission_currency IN ('GHS', 'USD'));

-- Defaults only exist so the ALTER works on existing rows; new rows must set them.
ALTER TABLE influencers
  ALTER COLUMN partner_type DROP DEFAULT,
  ALTER COLUMN currency DROP DEFAULT,
  ALTER COLUMN commission_kind DROP DEFAULT,
  ALTER COLUMN commission_value DROP DEFAULT,
  ALTER COLUMN commission_currency DROP DEFAULT;

-- Contact fields. Email is optional (still globally unique when present: UNIQUE
-- allows many NULLs); a partner needs an email or a WhatsApp number.
ALTER TABLE influencers
  ADD COLUMN whatsapp TEXT CHECK (whatsapp ~ '^\+[1-9][0-9]{6,14}$'),  -- E.164
  ADD COLUMN town TEXT,
  ADD COLUMN ghl_contact_id TEXT,
  ALTER COLUMN email DROP NOT NULL;
ALTER TABLE influencers
  ADD CONSTRAINT influencers_email_or_whatsapp CHECK (email IS NOT NULL OR whatsapp IS NOT NULL);
-- One partner per WhatsApp number per hotel (bulk API upserts on it).
CREATE UNIQUE INDEX IF NOT EXISTS idx_influencers_hotel_whatsapp
  ON influencers(hotel_id, whatsapp) WHERE whatsapp IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_influencers_whatsapp ON influencers(whatsapp) WHERE whatsapp IS NOT NULL;

-- Ref code rules: letters/digits/hyphen, case-insensitive unique per hotel.
ALTER TABLE influencers
  ADD CONSTRAINT influencers_slug_format CHECK (slug ~ '^[a-z0-9-]{2,40}$');
CREATE UNIQUE INDEX IF NOT EXISTS idx_influencers_hotel_slug_lower
  ON influencers(hotel_id, lower(slug));

-- 2. Bookings reported by the hotel site (one row per booking_ref)
CREATE TABLE referral_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  booking_ref TEXT NOT NULL,
  -- NULL when the ref code matched no partner; ref_code keeps the raw value.
  influencer_id UUID REFERENCES influencers(id) ON DELETE SET NULL,
  ref_code TEXT NOT NULL DEFAULT '',
  check_in DATE,
  check_out DATE,
  nights INTEGER,
  room_total_usd NUMERIC(12,2),
  total_ghs NUMERIC(12,2),
  ghs_per_usd NUMERIC(12,6),
  amount_paid NUMERIC(12,2),
  currency TEXT,
  paid_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('paid', 'refunded', 'cancelled')),
  commission_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  commission_currency TEXT CHECK (commission_currency IN ('GHS', 'USD')),
  payout_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payout_status IN ('unpaid', 'paid')),
  payout_paid_at DATE,
  payout_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (hotel_id, booking_ref)
);

CREATE INDEX idx_referral_bookings_influencer ON referral_bookings(influencer_id, check_out DESC);
CREATE INDEX idx_referral_bookings_unknown ON referral_bookings(hotel_id) WHERE influencer_id IS NULL;

-- 3. Raw event log. The unique key makes repeated events no-ops.
CREATE TABLE referral_booking_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  booking_ref TEXT NOT NULL,
  event TEXT NOT NULL CHECK (event IN ('paid', 'refunded', 'cancelled')),
  payload JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (hotel_id, booking_ref, event)
);

-- 4. Service role only (no policies = no anon/auth access)
ALTER TABLE influencers ENABLE ROW LEVEL SECURITY;
ALTER TABLE influencer_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_booking_events ENABLE ROW LEVEL SECURITY;
