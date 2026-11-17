-- P2 Abeiku-wide partner accounts (2026-11-17). NOT applied; Maddie runs it via the Supabase
-- Management API (project egmtxlijuhvwsjbrldga). Safe to run twice; one transaction.
--
-- Shape: `influencers` stays the per-hotel membership table (hotel, ref code, type, commission,
-- link). Its ids, codes (slug) and links do not change, so influencer_clicks and referral_bookings
-- keep pointing at the same rows. New: `partner_accounts` (one login per person) and
-- `influencers.account_id`.
--
-- What changes:
--   1. New table partner_accounts (email, whatsapp, name, password_hash). Email unique, case-insensitive.
--   2. New column influencers.account_id (+ one membership per account per hotel).
--   3. Email on influencers becomes unique PER HOTEL (case-insensitive) instead of globally, so one
--      person can be a partner of two hotels. Nothing else is relaxed.
--   4. Data: every influencers row without an account gets one. Rows with the same email
--      (any case) share one account. Rows without email get one account each. The account takes the
--      password of the row that has one (most recent login first). Codes, ids, clicks and bookings
--      are not touched.
--
-- The app works before and after this runs: until partner_accounts exists it behaves as before.

BEGIN;

-- Before: what is there.
SELECT count(*) AS partners,
       count(DISTINCT lower(email)) AS distinct_emails,
       count(*) FILTER (WHERE email IS NULL) AS without_email,
       count(*) FILTER (WHERE password_hash IS NOT NULL) AS with_password
FROM influencers;

-- 1. Accounts
CREATE TABLE IF NOT EXISTS partner_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT,
  whatsapp TEXT CHECK (whatsapp ~ '^\+[1-9][0-9]{6,14}$'),
  name TEXT NOT NULL,
  password_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ,
  CONSTRAINT partner_accounts_email_or_whatsapp CHECK (email IS NOT NULL OR whatsapp IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_accounts_email_lower
  ON partner_accounts(lower(email)) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_partner_accounts_whatsapp
  ON partner_accounts(whatsapp) WHERE whatsapp IS NOT NULL;
-- Service role only, like influencers (no policies = no anon/auth access).
ALTER TABLE partner_accounts ENABLE ROW LEVEL SECURITY;

-- 2. Membership link
ALTER TABLE influencers
  ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES partner_accounts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_influencers_account ON influencers(account_id) WHERE account_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_influencers_hotel_account
  ON influencers(hotel_id, account_id) WHERE account_id IS NOT NULL;

-- 3. Email unique per hotel instead of globally. Create the new index first (it cannot fail while
-- the global one holds, unless two rows differ only by case: then the whole script stops here).
CREATE UNIQUE INDEX IF NOT EXISTS idx_influencers_hotel_email_lower
  ON influencers(hotel_id, lower(email)) WHERE email IS NOT NULL;
DO $$
DECLARE c TEXT;
BEGIN
  -- The original UNIQUE on influencers.email (name not assumed: find it).
  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY (con.conkey)
    WHERE con.conrelid = 'influencers'::regclass
      AND con.contype = 'u'
      AND array_length(con.conkey, 1) = 1
      AND att.attname = 'email'
  LOOP
    EXECUTE format('ALTER TABLE influencers DROP CONSTRAINT %I', c);
  END LOOP;
END $$;

-- 4a. One account per email (case-insensitive), for rows not linked yet.
INSERT INTO partner_accounts (email, whatsapp, name, password_hash, created_at, last_login_at)
SELECT lower(i.email),
       (array_agg(i.whatsapp ORDER BY i.password_hash IS NULL, i.last_login_at DESC NULLS LAST, i.created_at)
          FILTER (WHERE i.whatsapp IS NOT NULL))[1],
       (array_agg(i.name ORDER BY i.password_hash IS NULL, i.last_login_at DESC NULLS LAST, i.created_at))[1],
       (array_agg(i.password_hash ORDER BY i.password_hash IS NULL, i.last_login_at DESC NULLS LAST, i.created_at))[1],
       min(i.created_at),
       max(i.last_login_at)
FROM influencers i
WHERE i.account_id IS NULL
  AND i.email IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM partner_accounts a WHERE lower(a.email) = lower(i.email))
GROUP BY lower(i.email);

UPDATE influencers i
SET account_id = a.id
FROM partner_accounts a
WHERE i.account_id IS NULL
  AND i.email IS NOT NULL
  AND lower(a.email) = lower(i.email);

-- 4b. Rows without email: one account each (WhatsApp-only partners).
WITH src AS (
  SELECT id AS influencer_id, gen_random_uuid() AS account_id, whatsapp, name, password_hash, created_at, last_login_at
  FROM influencers
  WHERE account_id IS NULL AND email IS NULL
), made AS (
  INSERT INTO partner_accounts (id, email, whatsapp, name, password_hash, created_at, last_login_at)
  SELECT account_id, NULL, whatsapp, name, password_hash, created_at, last_login_at FROM src
  RETURNING id
)
UPDATE influencers i
SET account_id = src.account_id
FROM src
WHERE i.id = src.influencer_id
  AND src.account_id IN (SELECT id FROM made);

-- After: every partner has an account (unlinked should be 0), codes unchanged.
SELECT count(*) AS partners,
       count(*) FILTER (WHERE account_id IS NULL) AS unlinked,
       count(DISTINCT account_id) AS accounts_used,
       (SELECT count(*) FROM partner_accounts) AS accounts_total
FROM influencers;

COMMIT;

-- Check by hand (read-only): Aracuya codes still there, with their clicks and bookings.
-- SELECT i.slug, i.account_id IS NOT NULL AS has_account,
--        (SELECT count(*) FROM influencer_clicks c WHERE c.influencer_id = i.id) AS clicks,
--        (SELECT count(*) FROM referral_bookings b WHERE b.influencer_id = i.id) AS bookings
-- FROM influencers i JOIN hotels h ON h.id = i.hotel_id
-- WHERE h.slug = 'aracuya' ORDER BY i.slug;
