-- Migration: Platform-owned MoMo Collections + Disbursements
-- Run this in Supabase SQL Editor against your EXISTING database.

-- 1. Hotels: remove per-hotel MoMo API credentials, add fee config + payout phone
ALTER TABLE hotels
  DROP COLUMN IF EXISTS momo_subscription_key,
  DROP COLUMN IF EXISTS momo_api_user_id,
  DROP COLUMN IF EXISTS momo_api_key,
  DROP COLUMN IF EXISTS momo_environment,
  DROP COLUMN IF EXISTS platform_fee;

ALTER TABLE hotels
  ADD COLUMN IF NOT EXISTS fee_type TEXT NOT NULL DEFAULT 'flat' CHECK (fee_type IN ('flat', 'percentage')),
  ADD COLUMN IF NOT EXISTS fee_value NUMERIC(10,2) NOT NULL DEFAULT 20.00,
  ADD COLUMN IF NOT EXISTS momo_phone TEXT;

-- 2. Payments: add MoMo phone + disbursement tracking
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS momo_phone TEXT,
  ADD COLUMN IF NOT EXISTS disbursement_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS disbursement_reference_id TEXT,
  ADD COLUMN IF NOT EXISTS disbursement_error TEXT;

-- 3. New table: disbursements
CREATE TABLE IF NOT EXISTS disbursements (
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

CREATE INDEX IF NOT EXISTS idx_disbursements_payment ON disbursements(payment_id);
CREATE INDEX IF NOT EXISTS idx_disbursements_status ON disbursements(status);
CREATE INDEX IF NOT EXISTS idx_disbursements_hotel ON disbursements(hotel_id);

-- 4. New table: platform_earnings
CREATE TABLE IF NOT EXISTS platform_earnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL,
  fee_type TEXT NOT NULL,
  fee_value NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_earnings_hotel ON platform_earnings(hotel_id);

-- 5. Enable RLS on new tables
ALTER TABLE disbursements ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_earnings ENABLE ROW LEVEL SECURITY;
