-- F2 reliability (2026-11-15). Additive only: new table + two new nullable/defaulted columns.
-- NOT applied. The code works without it:
--   * auth_attempts missing  -> login/MoMo limits fall back to per-instance memory (logged).
--   * hotels.whatsapp_booking_bot_enabled missing -> bot treated as off (the intended default).
--   * hotels.booking_url missing -> widget uses HOTEL_BOOKING_URLS env / Aracuya default.

-- 1. Failed-attempt log for rate limits (admin login, partner login, MoMo verification).
--    key examples: 'admin:ip:1.2.3.4', 'admin:acct:<sha256 prefix>', 'momo-confirm:<hotel>:<ref>'
CREATE TABLE IF NOT EXISTS auth_attempts (
  id BIGSERIAL PRIMARY KEY,
  key TEXT NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_attempts_key_time ON auth_attempts (key, attempted_at);
CREATE INDEX IF NOT EXISTS auth_attempts_time ON auth_attempts (attempted_at);
-- Service-role only (same as every other table): RLS on, no policies.
ALTER TABLE auth_attempts ENABLE ROW LEVEL SECURITY;

-- 2. Abeiku's own WhatsApp booking bot, per hotel. Off by default (decision: people reply).
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS whatsapp_booking_bot_enabled BOOLEAN NOT NULL DEFAULT false;

-- 3. Where the public widget's "Book" button goes.
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS booking_url TEXT;
-- Optional, after review: UPDATE hotels SET booking_url = 'https://aracuya.com/reserve' WHERE slug = 'aracuya';
