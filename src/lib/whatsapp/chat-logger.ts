// Chat message + event logging.
// These functions never throw (errors are logged), but callers must await them:
// on serverless hosts (Netlify) the function is frozen once the response is
// returned, so unawaited writes are lost.

import { supabase } from "@/lib/supabase/client";

/** Run a Supabase write, log its error instead of throwing. */
async function safeWrite(
  label: string,
  write: PromiseLike<{ error: { message: string } | null }>,
): Promise<void> {
  try {
    const { error } = await write;
    if (error) console.error(`[ChatLogger] ${label} error:`, error.message);
  } catch (e) {
    console.error(`[ChatLogger] ${label} error:`, e);
  }
}

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

export async function logMessage(params: LogMessageParams): Promise<void> {
  const writes: Promise<void>[] = [];

  // Insert message record
  writes.push(safeWrite("logMessage", supabase
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
    })));

  // Update conversation last_message_at + preview
  writes.push(safeWrite("update conversation", supabase
    .from("conversations")
    .update({
      last_message_at: new Date().toISOString(),
      last_message_preview: params.body?.slice(0, 100) ?? null,
    })
    .eq("hotel_id", params.hotelId)
    .eq("phone", params.phone)));

  // Increment unread count for inbound messages
  if (params.direction === "inbound") {
    writes.push(safeWrite("increment_unread",
      supabase.rpc("increment_unread", { p_hotel_id: params.hotelId, p_phone: params.phone })));
  }

  await Promise.all(writes);
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

export async function logEvent(params: LogEventParams): Promise<void> {
  await safeWrite("logEvent", supabase
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
    }));
}
