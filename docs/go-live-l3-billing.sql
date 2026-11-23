-- L3 billing: grace period then lock. Run in the Supabase SQL editor.
-- Safe to run more than once. Additive: one new nullable column on hotels, and a one-time fill
-- for hotels already past due. Drops nothing. Needs docs/l2-signup/billing.sql first.
--
-- The code works without this file: reads and writes fall back to the columns without
-- past_due_since, so billing keeps working, but no past-due hotel is ever locked.
--
-- Billing emails need no new table: their once-only markers go in the existing billing_events
-- table with provider = 'email' (primary key provider + event_id).

ALTER TABLE hotels ADD COLUMN IF NOT EXISTS past_due_since TIMESTAMPTZ;

COMMENT ON COLUMN hotels.past_due_since IS
  'When billing_status first became past_due. 14 days later the admin is locked to /admin/plan until a payment goes through. NULL when not past due.';

-- Hotels that are already past due: their 14 days start now (not from an older date, so no one
-- is locked out the moment this runs).
UPDATE hotels SET past_due_since = now()
 WHERE billing_status = 'past_due' AND past_due_since IS NULL;

-- Make PostgREST see the new column straight away.
NOTIFY pgrst, 'reload schema';

-- Check:
-- SELECT name, billing_status, past_due_since FROM hotels WHERE billing_status = 'past_due';
