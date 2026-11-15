// Decides what happens to an incoming WhatsApp message.
//
// Decision (plan, 2026-11-14): people at the hotel reply to guests; there is no
// booking bot. Abeiku's own booking flow (state-machine.ts) stays in the code
// but only runs for a hotel whose `whatsapp_booking_bot_enabled` is true.
// Every other hotel (the default) just gets the message stored for the inbox:
// no automatic reply, no booking, no "Booking Confirmed", no read receipt.

import type { Hotel } from "@/lib/db";
import type { Conversation, WhatsAppMessage } from "./types";
import type { LogMessageParams } from "./chat-logger";

export function isBookingBotEnabled(hotel: Pick<Hotel, "whatsapp_booking_bot_enabled"> | null | undefined): boolean {
  return hotel?.whatsapp_booking_bot_enabled === true;
}

/** Text shown in the inbox for any kind of incoming message. */
export function inboundPreview(message: WhatsAppMessage): string {
  return (
    message.text?.body ??
    message.interactive?.button_reply?.title ??
    message.interactive?.list_reply?.title ??
    `[${message.type}]`
  );
}

export interface InboundDeps {
  determineGuestState: (hotelId: string, phone: string) => Promise<Conversation["guest_state"]>;
  getConversation: (hotelId: string, phone: string) => Promise<Conversation | null>;
  upsertConversation: (
    hotelId: string,
    phone: string,
    updates: Partial<Pick<Conversation, "guest_state" | "step" | "context">> & { guest_name?: string }
  ) => Promise<Conversation>;
  recordMessage: (params: LogMessageParams) => Promise<boolean>;
  /** The booking bot. Only called when the hotel has it switched on. */
  handleMessage: (message: WhatsAppMessage, phone: string, name?: string) => Promise<void>;
  markAsRead: (messageId: string) => Promise<unknown>;
}

/** Store an incoming message for the inbox without replying. */
export async function storeInboundOnly(
  deps: InboundDeps,
  hotelId: string,
  message: WhatsAppMessage,
  senderPhone: string,
  senderName?: string
): Promise<boolean> {
  const guestState = await deps.determineGuestState(hotelId, senderPhone);
  let conversation = await deps.getConversation(hotelId, senderPhone);
  if (!conversation) {
    conversation = await deps.upsertConversation(hotelId, senderPhone, {
      guest_state: guestState,
      step: "idle",
      guest_name: senderName,
    });
  } else if (conversation.guest_state !== guestState || (senderName && !conversation.guest_name)) {
    conversation = await deps.upsertConversation(hotelId, senderPhone, {
      guest_state: guestState,
      ...(senderName && !conversation.guest_name ? { guest_name: senderName } : {}),
    });
  }

  return deps.recordMessage({
    hotelId,
    conversationId: conversation.id,
    phone: senderPhone,
    direction: "inbound",
    messageType: message.type,
    body: inboundPreview(message),
    rawPayload: message as unknown as object,
    waMessageId: message.id,
    senderType: "guest",
    senderName,
    guestState,
    step: conversation.step,
  });
}

/** Route one incoming message: booking bot if switched on for the hotel, else inbox only. */
export async function processInbound(
  deps: InboundDeps,
  hotel: Pick<Hotel, "id" | "whatsapp_booking_bot_enabled">,
  message: WhatsAppMessage,
  senderPhone: string,
  senderName?: string
): Promise<"bot" | "stored"> {
  if (isBookingBotEnabled(hotel)) {
    try {
      await deps.markAsRead(message.id);
    } catch {
      // Non-critical
    }
    await deps.handleMessage(message, senderPhone, senderName);
    return "bot";
  }
  await storeInboundOnly(deps, hotel.id, message, senderPhone, senderName);
  return "stored";
}
