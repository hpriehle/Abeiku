-- Migration: WhatsApp templates, coexistence and delivery status
-- Run this in the Supabase SQL Editor against the EXISTING database.

-- 1. Hotels: per-hotel bot switch + coexistence metadata
ALTER TABLE hotels
  ADD COLUMN IF NOT EXISTS whatsapp_bot_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_is_on_biz_app BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_business_id TEXT,
  -- Two-step verification PIN set when Abeiku registers a new (non-coexistence) number
  ADD COLUMN IF NOT EXISTS whatsapp_registration_pin TEXT;

-- 2. Chat messages: delivery status from Meta's status webhooks
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS wa_status TEXT,          -- sent | delivered | read | failed
  ADD COLUMN IF NOT EXISTS wa_error TEXT,
  ADD COLUMN IF NOT EXISTS wa_status_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_chat_messages_wa_message_id
  ON chat_messages(wa_message_id) WHERE wa_message_id IS NOT NULL;

-- 3. Template sends sent from the dashboard to people with no prior conversation
--    reuse conversations/chat_messages; the 'admin' sender type already covers them.
