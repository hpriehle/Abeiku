import { describe, it, expect, vi } from "vitest";
import { processInbound, isBookingBotEnabled, inboundPreview, type InboundDeps } from "./inbound";
import type { Conversation, WhatsAppMessage } from "./types";

const msg: WhatsAppMessage = { from: "233200000000", id: "wamid.1", timestamp: "1", type: "text", text: { body: "Do you have a room on Friday?" } };

function deps(existing: Partial<Conversation> | null = null) {
  const conv = { id: "c1", phone: msg.from, guest_state: "lead", step: "idle", guest_name: null, ...existing } as Conversation;
  return {
    determineGuestState: vi.fn(async () => "lead" as const),
    getConversation: vi.fn(async () => (existing ? conv : null)),
    upsertConversation: vi.fn(async () => conv),
    recordMessage: vi.fn(async () => true),
    handleMessage: vi.fn(async () => {}),
    markAsRead: vi.fn(async () => ({})),
  } satisfies InboundDeps;
}

describe("WhatsApp booking bot switch (F2 item 3)", () => {
  it("is off unless explicitly true", () => {
    expect(isBookingBotEnabled({ whatsapp_booking_bot_enabled: undefined })).toBe(false);
    expect(isBookingBotEnabled({ whatsapp_booking_bot_enabled: null })).toBe(false);
    expect(isBookingBotEnabled({ whatsapp_booking_bot_enabled: false })).toBe(false);
    expect(isBookingBotEnabled(null)).toBe(false);
    expect(isBookingBotEnabled({ whatsapp_booking_bot_enabled: true })).toBe(true);
  });

  it("bot off (default): stores the message for the inbox, never runs the bot or replies", async () => {
    const d = deps();
    const out = await processInbound(d, { id: "h1" }, msg, msg.from, "Ama");
    expect(out).toBe("stored");
    expect(d.handleMessage).not.toHaveBeenCalled(); // no booking, no "Booking Confirmed"
    expect(d.markAsRead).not.toHaveBeenCalled(); // no read receipt until a person reads it
    expect(d.upsertConversation).toHaveBeenCalledWith("h1", msg.from, { guest_state: "lead", step: "idle", guest_name: "Ama" });
    expect(d.recordMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        hotelId: "h1",
        conversationId: "c1",
        direction: "inbound",
        senderType: "guest",
        body: "Do you have a room on Friday?",
        waMessageId: "wamid.1",
      })
    );
  });

  it("bot off: existing conversation is reused and the name filled in", async () => {
    const d = deps({ guest_name: null });
    await processInbound(d, { id: "h1", whatsapp_booking_bot_enabled: false }, msg, msg.from, "Ama");
    expect(d.upsertConversation).toHaveBeenCalledWith("h1", msg.from, { guest_state: "lead", guest_name: "Ama" });
    expect(d.handleMessage).not.toHaveBeenCalled();
  });

  it("bot on: hands the message to the booking flow", async () => {
    const d = deps();
    const out = await processInbound(d, { id: "h1", whatsapp_booking_bot_enabled: true }, msg, msg.from, "Ama");
    expect(out).toBe("bot");
    expect(d.handleMessage).toHaveBeenCalledWith(msg, msg.from, "Ama");
    expect(d.recordMessage).not.toHaveBeenCalled(); // the bot logs it itself
  });

  it("previews non-text messages", () => {
    expect(inboundPreview({ ...msg, type: "image", text: undefined })).toBe("[image]");
  });
});
