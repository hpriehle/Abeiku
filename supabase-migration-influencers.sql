-- Influencer Referral System
-- Adds per-hotel influencer accounts with slug-based referral links and click tracking.
-- Distinct from the existing referral_codes table (which handles booking discount codes).

CREATE TABLE influencers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  invite_token TEXT UNIQUE,
  invite_expires_at TIMESTAMPTZ,
  redirect_url TEXT NOT NULL DEFAULT '/',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ,
  UNIQUE (hotel_id, slug)
);

CREATE INDEX idx_influencers_hotel_slug ON influencers(hotel_id, slug);
CREATE INDEX idx_influencers_invite_token ON influencers(invite_token) WHERE invite_token IS NOT NULL;

CREATE TABLE influencer_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  influencer_id UUID NOT NULL REFERENCES influencers(id) ON DELETE CASCADE,
  clicked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_hash TEXT,
  user_agent TEXT,
  referer TEXT,
  country TEXT
);

CREATE INDEX idx_influencer_clicks_influencer_time
  ON influencer_clicks(influencer_id, clicked_at DESC);
