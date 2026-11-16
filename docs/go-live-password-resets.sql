-- Forgot password (2026-11-16). Additive only: one new table. NOT applied; run by hand in the
-- Supabase SQL editor (project egmtxlijuhvwsjbrldga). Safe to run twice.
--
-- One row per "reset my password" email. Only the SHA-256 of the token is stored; the token
-- itself is only in the email link. A row is good for 1 hour and once: using it sets used_at,
-- and also closes every other open row for the same admin user.
--
-- Without this table "Forgot password?" still answers normally but no email can be sent
-- (the insert fails and is logged), so nothing else breaks.

CREATE TABLE IF NOT EXISTS password_resets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS password_resets_user_open ON password_resets (admin_user_id) WHERE used_at IS NULL;
CREATE INDEX IF NOT EXISTS password_resets_created ON password_resets (created_at);

-- Service-role only (same as every other table): RLS on, no policies.
ALTER TABLE password_resets ENABLE ROW LEVEL SECURITY;

-- Optional housekeeping, any time later:
-- DELETE FROM password_resets WHERE created_at < now() - interval '30 days';
