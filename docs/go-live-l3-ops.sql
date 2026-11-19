-- L3: throttle for failure emails to Harrison (src/lib/ops/alerts.ts). Run in the Supabase SQL editor.
-- Safe to run more than once. Additive only: one new table. Drops nothing, changes no rows.
-- The code works without this file: each server instance then keeps its own hourly throttle in
-- memory, so a failure seen by several instances can send a few more emails per hour.

CREATE TABLE IF NOT EXISTS ops_alerts (
  kind TEXT PRIMARY KEY,
  last_sent_at TIMESTAMPTZ NOT NULL
);

COMMENT ON TABLE ops_alerts IS
  'One row per failure kind (e.g. stripe-webhook, booking-sync-feed:aracuya): when the last alert email went to Harrison. At most one email per kind per hour.';

-- Server-only (service role). No policies: nothing in the browser reads it.
ALTER TABLE ops_alerts ENABLE ROW LEVEL SECURITY;

-- Make PostgREST see the new table straight away.
NOTIFY pgrst, 'reload schema';
