-- L2 self-serve sign-up and billing. Run the whole file in the Supabase SQL editor.
-- Safe to run more than once. Additive only: new columns on hotels, one new table. Drops nothing.
-- The only existing data it changes: Aracuya gets billing_exempt = true (never billed, never blocked).
-- The code works without this file: every hotel keeps full access, and sign-up says it is not ready.

BEGIN;

-- Never billed and never blocked (Aracuya, test hotels).
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS billing_exempt BOOLEAN NOT NULL DEFAULT false;

-- NULL = not on Abeiku billing (every hotel that existed before sign-up): full access.
-- pending_card | trialing | active | past_due | canceled
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS billing_status TEXT;
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS billing_provider TEXT;      -- paystack | stripe
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS billing_currency TEXT;      -- GHS | USD
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS billing_tier TEXT;          -- small (1-5 rooms) | large (6+)
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS room_count INTEGER;
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ;
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS billing_customer_id TEXT;   -- Paystack CUS_... / Stripe cus_...
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS billing_subscription_id TEXT; -- Paystack SUB_... / Stripe sub_...
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS billing_setup_ref TEXT;     -- card step in progress
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS billing_updated_at TIMESTAMPTZ;

-- Sign-up: the owner's calendar links (Airbnb/Booking.com/VRBO iCal export URLs, Google calendar ID).
-- Stored only; calendar sync does not read these yet.
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS calendar_links JSONB;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hotels_billing_status_check') THEN
    ALTER TABLE hotels ADD CONSTRAINT hotels_billing_status_check
      CHECK (billing_status IS NULL OR billing_status IN ('pending_card','trialing','active','past_due','canceled'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS hotels_billing_subscription_idx ON hotels (billing_provider, billing_subscription_id);
CREATE INDEX IF NOT EXISTS hotels_billing_customer_idx ON hotels (billing_provider, billing_customer_id);

-- Aracuya: exempt.
UPDATE hotels SET billing_exempt = true
 WHERE id = '75218f6b-a953-4b74-b5c8-abd040af21f1' AND billing_exempt = false;

-- Webhook deliveries already applied (so a repeat delivery changes nothing).
CREATE TABLE IF NOT EXISTS billing_events (
  provider    TEXT NOT NULL,
  event_id    TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, event_id)
);
ALTER TABLE billing_events ENABLE ROW LEVEL SECURITY; -- server (service role) only

COMMIT;

-- Check:
-- SELECT name, billing_exempt, billing_status FROM hotels ORDER BY created_at;
