-- P1 partner setup links (2026-11-17). NOT applied; Maddie runs it via the Supabase Management
-- API. Data only, no schema change. Safe to run twice.
--
-- Setup links now never expire until used (invite_expires_at NULL = valid). The code already
-- issues new links with NULL. This clears the expiry on links already sent to partners who have
-- not set a password yet (Aracuya: ~50 partners, expiring 2026-11-28), including ones that have
-- already passed their date, so every link a partner holds keeps working.
--
-- Partners WITH a password are left alone: an open token there is a password-reset link and keeps
-- its 3-day expiry.

-- Before: how many will change.
SELECT count(*) AS unused_invites_with_expiry
FROM influencers
WHERE password_hash IS NULL
  AND invite_token IS NOT NULL
  AND invite_expires_at IS NOT NULL;

UPDATE influencers
SET invite_expires_at = NULL
WHERE password_hash IS NULL
  AND invite_token IS NOT NULL
  AND invite_expires_at IS NOT NULL;

-- After: should be 0.
SELECT count(*) AS remaining
FROM influencers
WHERE password_hash IS NULL
  AND invite_token IS NOT NULL
  AND invite_expires_at IS NOT NULL;
