-- Terms and Privacy Policy agreement at sign-up. Run in the Supabase SQL editor.
-- Safe to run more than once. Additive only: one new nullable column. Drops nothing, changes no rows.
-- The code works without this file: sign-up still requires the box to be ticked, but the time is
-- not saved (a warning is logged) until the column exists.

ALTER TABLE hotels ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;

COMMENT ON COLUMN hotels.terms_accepted_at IS
  'When the sign-up owner ticked "I agree to the Terms and Privacy Policy". NULL for hotels created before this, or by hand.';

-- Make PostgREST see the new column straight away.
NOTIFY pgrst, 'reload schema';
