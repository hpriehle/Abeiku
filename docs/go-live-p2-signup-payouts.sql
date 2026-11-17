-- P2 steps 2 and 5 (2026-11-17): partner sign-up with email check, partner forgot password, and
-- hotel-recorded payouts. NOT applied. Run AFTER docs/go-live-p2-accounts.sql (it needs
-- partner_accounts). Additive only, safe to run twice, one transaction.
--
-- What changes:
--   1. partner_accounts: email_confirm_pending (true only for accounts made by /partner/signup until
--      their confirm link is used) and email_confirmed_at. Existing accounts get false: nothing
--      changes for them.
--   2. New table partner_tokens: one-time links for "confirm your email" and "forgot password"
--      (SHA-256 of the token only, like password_resets).
--   3. New table partner_payouts: what a hotel paid a partner (amount, currency, date, how,
--      reference). No money moves through Abeiku; this is a record.
--   4. New column referral_bookings.payout_id: the payout that covered a booking (the booking is
--      also marked paid with the existing payout_status / payout_paid_at / payout_note).
--
-- The app works before and after this runs: sign-up answers "not open yet", forgot password sends
-- nothing, recording a payout answers "not switched on yet", and payout lists are empty.

BEGIN;

-- 1. Email check for self-signed-up accounts
ALTER TABLE partner_accounts
  ADD COLUMN IF NOT EXISTS email_confirm_pending BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_confirmed_at TIMESTAMPTZ;

-- 2. One-time links
CREATE TABLE IF NOT EXISTS partner_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES partner_accounts(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('confirm_email', 'reset_password')),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_partner_tokens_account ON partner_tokens(account_id, purpose) WHERE used_at IS NULL;
-- Service role only (no policies = no anon/auth access).
ALTER TABLE partner_tokens ENABLE ROW LEVEL SECURITY;

-- 3. Payouts
CREATE TABLE IF NOT EXISTS partner_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  influencer_id UUID NOT NULL REFERENCES influencers(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL CHECK (currency IN ('GHS', 'USD')),
  paid_on DATE NOT NULL,
  method TEXT NOT NULL CHECK (length(method) BETWEEN 1 AND 100),
  reference TEXT CHECK (reference IS NULL OR length(reference) <= 100),
  recorded_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_partner_payouts_partner ON partner_payouts(influencer_id, paid_on DESC);
CREATE INDEX IF NOT EXISTS idx_partner_payouts_hotel ON partner_payouts(hotel_id, paid_on DESC);
ALTER TABLE partner_payouts ENABLE ROW LEVEL SECURITY;

-- 4. Which payout covered a booking
ALTER TABLE referral_bookings
  ADD COLUMN IF NOT EXISTS payout_id UUID REFERENCES partner_payouts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_referral_bookings_payout ON referral_bookings(payout_id) WHERE payout_id IS NOT NULL;

-- After: nothing pending yet, tables empty.
SELECT (SELECT count(*) FROM partner_accounts WHERE email_confirm_pending) AS pending_accounts,
       (SELECT count(*) FROM partner_tokens) AS tokens,
       (SELECT count(*) FROM partner_payouts) AS payouts;

COMMIT;
