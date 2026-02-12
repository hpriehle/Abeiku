-- Migration: Notification preferences + notification log
-- Run this in Supabase SQL Editor against your EXISTING database.

-- 1. Notification preferences — per-hotel, per-event, per-channel toggles
CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  whatsapp_enabled BOOLEAN NOT NULL DEFAULT false,
  email_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(hotel_id, event_type)
);

CREATE INDEX IF NOT EXISTS idx_notification_prefs_hotel ON notification_preferences(hotel_id);

-- 2. Notification log — audit trail of every notification sent/attempted
CREATE TABLE IF NOT EXISTS notification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'email')),
  recipient TEXT NOT NULL,
  subject TEXT,
  body_preview TEXT,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'skipped')),
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_log_hotel ON notification_log(hotel_id);
CREATE INDEX IF NOT EXISTS idx_notification_log_hotel_event ON notification_log(hotel_id, event_type);
CREATE INDEX IF NOT EXISTS idx_notification_log_created ON notification_log(created_at);

-- 3. Enable RLS
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;

-- 4. Seed default preferences for existing hotels
-- (All events: email enabled, WhatsApp disabled by default since it costs money)
INSERT INTO notification_preferences (hotel_id, event_type, whatsapp_enabled, email_enabled)
SELECT h.id, e.event_type, false, true
FROM hotels h
CROSS JOIN (VALUES
  ('new_booking'),
  ('payment_received'),
  ('payment_failed'),
  ('new_review'),
  ('disbursement_completed'),
  ('disbursement_failed')
) AS e(event_type)
ON CONFLICT (hotel_id, event_type) DO NOTHING;
