-- Platform actions (gap #14): suspend a hotel, and an audit row for every action Harrison takes
-- on the platform page (extend trial, billing exempt on/off, suspend/unsuspend).
-- Run in the Supabase SQL editor. Safe to run more than once. Additive: one nullable column on
-- hotels and one new table. Drops nothing. Needs docs/l2-signup/billing.sql first.
--
-- Before this runs: the page still works for extend trial and exempt, but suspend fails, and
-- every action reports that its audit row could not be written.

ALTER TABLE hotels ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;

COMMENT ON COLUMN hotels.suspended_at IS
  'Set by the platform admin. While set, the admin is locked to /admin/plan (same lock as a lapsed payment grace). NULL = not suspended.';

CREATE TABLE IF NOT EXISTS platform_actions (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_id UUID,
  actor_email TEXT NOT NULL,
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  detail TEXT
);

CREATE INDEX IF NOT EXISTS platform_actions_hotel_idx ON platform_actions (hotel_id, created_at DESC);

-- Server only (service role). No policies: the anon key can't read or write it.
ALTER TABLE platform_actions ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';

-- Check:
-- SELECT created_at, actor_email, action, detail FROM platform_actions ORDER BY created_at DESC LIMIT 20;
