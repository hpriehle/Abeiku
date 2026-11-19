-- L3 step 6: confirm login email, change email/password, sign out old sessions (2026-11-17).
-- Additive only. NOT applied by the code; run once against project egmtxlijuhvwsjbrldga.
-- Safe to run twice.
--
-- Until this runs the app keeps working: no session is ever ended, every admin counts as
-- confirmed (no banner), and confirm links can't be created (logged; sign-up still works).

-- 1. Session version: every admin session carries the version it was issued with. A password
--    reset or change adds 1, which ends every older session of that login.
--    Existing sessions have no version and count as 0, so nobody is signed out by this SQL.
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0;

-- 2. When the login email was confirmed. NULL = not confirmed (admin banner nags; nothing blocked).
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

-- Existing admins (Harrison on Aracuya today) count as confirmed.
UPDATE admin_users SET email_verified_at = COALESCE(created_at, now()) WHERE email_verified_at IS NULL;

-- 3. Confirm links. Same pattern as password_resets: only the SHA-256 of the token is stored,
--    24 hours, single use. purpose 'verify' = sign-up email, 'change' = new login email (in `email`;
--    the switch happens only when the link is opened).
CREATE TABLE IF NOT EXISTS email_confirmations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('verify', 'change')),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_confirmations_user_open ON email_confirmations (admin_user_id, purpose) WHERE used_at IS NULL;
CREATE INDEX IF NOT EXISTS email_confirmations_created ON email_confirmations (created_at);

-- Service-role only (same as every other table): RLS on, no policies.
ALTER TABLE email_confirmations ENABLE ROW LEVEL SECURITY;

-- Check:
-- SELECT email, session_version, email_verified_at FROM admin_users;

-- Optional housekeeping, any time later:
-- DELETE FROM email_confirmations WHERE created_at < now() - interval '30 days';
