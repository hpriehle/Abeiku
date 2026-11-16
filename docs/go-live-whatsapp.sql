-- WhatsApp on abeiku.com (W2, 2026-11-16). Additive only. NOT applied; run by hand in the
-- Supabase SQL editor (project egmtxlijuhvwsjbrldga) BEFORE connecting a hotel's number.
-- Safe to run twice. Replaces the old root file supabase-migration-whatsapp-templates.sql.
--
-- Without it the code still runs: the webhook stores messages, but delivery statuses are not
-- saved, the "WhatsApp booking alerts" field in Settings is disabled, and no WhatsApp
-- booking alerts are sent (email alerts are unaffected).

-- 1. Hotels: coexistence metadata from Embedded Signup.
ALTER TABLE hotels
  ADD COLUMN IF NOT EXISTS whatsapp_is_on_biz_app BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_business_id TEXT,
  -- Two-step verification PIN set when Abeiku registers a new (non-coexistence) number
  ADD COLUMN IF NOT EXISTS whatsapp_registration_pin TEXT;

-- Booking bot switch (also in supabase-migration-f2-reliability.sql). Off by default; the
-- bot stays off for every hotel (W2: people reply from the inbox).
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS whatsapp_booking_bot_enabled BOOLEAN NOT NULL DEFAULT false;

-- 2. Manager's WhatsApp for booking alerts ("+<digits>"). Alerts go there only while the
--    hotel's own WhatsApp number is connected (token + phone number id set).
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS alert_whatsapp TEXT;

-- 3. Chat messages: delivery status from Meta's status webhooks.
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS wa_status TEXT,          -- sent | delivered | read | failed
  ADD COLUMN IF NOT EXISTS wa_error TEXT,
  ADD COLUMN IF NOT EXISTS wa_status_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_chat_messages_wa_message_id
  ON chat_messages(wa_message_id) WHERE wa_message_id IS NOT NULL;

-- 4. Aracuya: manager alert number. Nothing is sent until Aracuya's WhatsApp number is
--    connected AND the booking_alert template is approved (docs/whatsapp-setup.md).
--    Can also be set in Admin → Settings → WhatsApp booking alerts instead.
UPDATE hotels SET alert_whatsapp = '+233551542355'
 WHERE id = '75218f6b-a953-4b74-b5c8-abd040af21f1' AND alert_whatsapp IS NULL;

-- Check:
-- SELECT slug, alert_whatsapp, whatsapp_booking_bot_enabled, whatsapp_is_on_biz_app FROM hotels;
