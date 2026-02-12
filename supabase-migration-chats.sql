-- Migration: Chat message logging + conversation events for analytics
-- Run this in Supabase SQL Editor against your EXISTING database.

-- 1. Chat messages — every inbound/outbound WhatsApp message
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),

  -- Message content
  message_type TEXT NOT NULL DEFAULT 'text',
  body TEXT,
  raw_payload JSONB DEFAULT '{}'::jsonb,

  -- WhatsApp metadata
  wa_message_id TEXT,

  -- Sender info
  sender_type TEXT NOT NULL CHECK (sender_type IN ('guest', 'bot', 'admin')),
  sender_name TEXT,

  -- Context snapshot at time of message
  guest_state TEXT,
  step TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_hotel ON chat_messages(hotel_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation ON chat_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_hotel_created ON chat_messages(hotel_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_hotel_direction ON chat_messages(hotel_id, direction);

-- 2. Conversation events — funnel tracking, state changes, AI parsing, key actions
CREATE TABLE IF NOT EXISTS conversation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,

  -- Event classification
  event_type TEXT NOT NULL,

  -- Funnel tracking
  funnel_step TEXT,

  -- State transitions
  from_state TEXT,
  to_state TEXT,

  -- AI parsing
  ai_intent TEXT,
  ai_confidence TEXT,
  ai_input_text TEXT,
  ai_response_time_ms INTEGER,

  -- Flexible metadata
  metadata JSONB DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conv_events_hotel ON conversation_events(hotel_id);
CREATE INDEX IF NOT EXISTS idx_conv_events_conversation ON conversation_events(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conv_events_hotel_type ON conversation_events(hotel_id, event_type);
CREATE INDEX IF NOT EXISTS idx_conv_events_hotel_funnel ON conversation_events(hotel_id, funnel_step) WHERE funnel_step IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conv_events_hotel_ai ON conversation_events(hotel_id, ai_intent) WHERE ai_intent IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conv_events_hotel_created ON conversation_events(hotel_id, created_at);

-- 3. Add inbox columns to conversations
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_message_preview TEXT,
  ADD COLUMN IF NOT EXISTS unread_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_conversations_last_message ON conversations(hotel_id, last_message_at DESC NULLS LAST);

-- 4. Enable RLS
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_events ENABLE ROW LEVEL SECURITY;

-- 5. Atomic unread counter increment
CREATE OR REPLACE FUNCTION increment_unread(p_hotel_id UUID, p_phone TEXT)
RETURNS VOID AS $$
  UPDATE conversations
  SET unread_count = unread_count + 1
  WHERE hotel_id = p_hotel_id AND phone = p_phone;
$$ LANGUAGE sql;
