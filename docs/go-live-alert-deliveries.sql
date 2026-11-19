-- Booking alert delivery log (src/lib/alerts/delivery-log.ts). Run in the Supabase SQL editor.
-- Safe to run more than once. Additive only: one new table. Drops nothing, changes no rows.
-- The code works without this file: alerts still go out, the missing table is logged once.

CREATE TABLE IF NOT EXISTS alert_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('new', 'cancel', 'digest')),
  channel TEXT NOT NULL CHECK (channel IN ('email', 'whatsapp')),
  recipient TEXT NOT NULL,
  provider_message_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'delivered', 'read')),
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE alert_deliveries IS
  'One row per recipient per booking alert (email or WhatsApp): sent with the Resend id / WhatsApp wamid, or failed with the error. The WhatsApp webhook moves it to delivered/read/failed.';

-- The webhook looks rows up by wamid.
CREATE INDEX IF NOT EXISTS alert_deliveries_provider_message_id_idx ON alert_deliveries(provider_message_id);
CREATE INDEX IF NOT EXISTS alert_deliveries_hotel_created_idx ON alert_deliveries(hotel_id, created_at DESC);

-- Server-only (service role). No policies: nothing in the browser reads it.
ALTER TABLE alert_deliveries ENABLE ROW LEVEL SECURITY;

-- Make PostgREST see the new table straight away.
NOTIFY pgrst, 'reload schema';
