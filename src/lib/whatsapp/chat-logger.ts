// Fire-and-forget chat message + event logging
// These functions never block the WhatsApp message processing flow.

import { supabase } from "@/lib/supabase/client";

// --- Message Logging ---

export interface LogMessageParams {
  hotelId: string;
  conversationId: string;
  phone: string;
  direction: "inbound" | "outbound";
  messageType: string;
  body: string | null;
  rawPayload?: object;
  waMessageId?: string;
  senderType: "guest" | "bot" | "admin";
  senderName?: string | null;
  guestState?: string;
  step?: string;
}

export function logMessage(params: LogMessageParams): void {
  void recordMessage(params);
}

/**
 * Same writes as logMessage, but the caller can await them. Used when storing
 * the message is the whole job (WhatsApp bot off), so a serverless function
 * must not return before the row is written. Never throws.
 */
export async function recordMessage(params: LogMessageParams): Promise<boolean> {
  const insert = supabase
    .from("chat_messages")
    .insert({
      hotel_id: params.hotelId,
      conversation_id: params.conversationId,
      phone: params.phone,
      direction: params.direction,
      message_type: params.messageType,
      body: params.body,
      raw_payload: params.rawPayload ?? {},
      wa_message_id: params.waMessageId,
      sender_type: params.senderType,
      sender_name: params.senderName,
      guest_state: params.guestState,
      step: params.step,
    })
    .then(({ error }) => {
      if (error) console.error("[ChatLogger] logMessage error:", error.message);
      return !error;
    });

  // Update conversation last_message_at + preview
  const touch = supabase
    .from("conversations")
    .update({
      last_message_at: new Date().toISOString(),
      last_message_preview: params.body?.slice(0, 100) ?? null,
    })
    .eq("hotel_id", params.hotelId)
    .eq("phone", params.phone)
    .then(({ error }) => {
      if (error) console.error("[ChatLogger] update conversation error:", error.message);
    });

  // Increment unread count for inbound messages
  const unread =
    params.direction === "inbound"
      ? supabase
          .rpc("increment_unread", { p_hotel_id: params.hotelId, p_phone: params.phone })
          .then(({ error }) => {
            if (error) console.error("[ChatLogger] increment_unread error:", error.message);
          })
      : Promise.resolve();

  try {
    const [ok] = await Promise.all([insert, touch, unread]);
    return ok;
  } catch (err) {
    console.error("[ChatLogger] recordMessage failed:", err);
    return false;
  }
}

// --- Event Logging ---

export interface LogEventParams {
  hotelId: string;
  conversationId: string;
  phone: string;
  eventType: string;
  funnelStep?: string;
  fromState?: string;
  toState?: string;
  aiIntent?: string;
  aiConfidence?: string;
  aiInputText?: string;
  aiResponseTimeMs?: number;
  metadata?: Record<string, unknown>;
}

export function logEvent(params: LogEventParams): void {
  supabase
    .from("conversation_events")
    .insert({
      hotel_id: params.hotelId,
      conversation_id: params.conversationId,
      phone: params.phone,
      event_type: params.eventType,
      funnel_step: params.funnelStep,
      from_state: params.fromState,
      to_state: params.toState,
      ai_intent: params.aiIntent,
      ai_confidence: params.aiConfidence,
      ai_input_text: params.aiInputText,
      ai_response_time_ms: params.aiResponseTimeMs,
      metadata: params.metadata ?? {},
    })
    .then(({ error }) => {
      if (error) console.error("[ChatLogger] logEvent error:", error.message);
    });
}
