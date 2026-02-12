// AI engine — uses Claude Haiku to interpret free-text messages and extract intent

import Anthropic from "@anthropic-ai/sdk";
import { getHotelRooms, HotelRoom } from "@/lib/db";
import { getHotelId, getHotel } from "@/lib/hotel-context";
import { ConversationContext, GuestState } from "@/lib/whatsapp/types";

const anthropic = new Anthropic();

export type Intent =
  | "book"
  | "view_rooms"
  | "check_availability"
  | "my_booking"
  | "modify_booking"
  | "cancel_booking"
  | "contact"
  | "leave_review"
  | "room_service"
  | "concierge"
  | "greeting"
  | "unknown";

export interface AIResponse {
  intent: Intent;
  reply: string;
  extracted: {
    dates?: { check_in: string; check_out: string };
    guest_name?: string;
    rooms_count?: number;
  };
}

function buildRoomInfo(rooms: HotelRoom[], currency: string): string {
  return rooms
    .map(
      (r) =>
        `- ${r.name}: ${r.tagline || ""}. ${r.size || ""}, ${r.bed_type || ""} bed, up to ${r.occupancy} guests per room. ` +
        `Pricing: ${(r.pricing_tiers as { label: string; price: number; rooms: number }[]).map((t) => `${t.label} = ${currency} ${t.price}/night`).join(", ")}. ` +
        `Amenities: ${(r.amenities as string[]).join(", ")}.`
    )
    .join("\n");
}

function buildSystemPrompt(
  guestState: GuestState,
  context: ConversationContext,
  roomInfo: string,
  hotelName: string,
  currency: string,
  location: string,
  checkInTime: string,
  checkOutTime: string,
): string {
  return `You are the WhatsApp booking assistant for ${hotelName}, a hotel in ${location}. You are warm, helpful, and concise. Keep replies under 200 words. Use WhatsApp formatting (*bold*, _italic_).

Respond in the same language the guest uses. If they write in French, reply in French. If Twi, reply in Twi. Default to English.

HOTEL INFO:
${roomInfo}

Location: ${location}
Currency: ${currency}
Check-in: ${checkInTime}
Check-out: ${checkOutTime}

GUEST STATE: ${guestState}
${context.selected_room ? `Selected room: ${context.selected_room}` : ""}
${context.check_in ? `Check-in: ${context.check_in}` : ""}
${context.check_out ? `Check-out: ${context.check_out}` : ""}
${context.guest_name ? `Guest name: ${context.guest_name}` : ""}

YOUR TASK:
1. Understand the guest's message
2. Respond helpfully and naturally
3. At the end of your response, output a JSON block on a new line starting with |||JSON||| containing:
   - "intent": one of: book, view_rooms, check_availability, my_booking, modify_booking, cancel_booking, contact, leave_review, room_service, concierge, greeting, unknown
   - "extracted": an object with any info you could extract:
     - "check_in": YYYY-MM-DD format if a check-in date was mentioned
     - "check_out": YYYY-MM-DD format if a check-out date was mentioned
     - "guest_name": if they provided their name
     - "rooms_count": 1, 2, or 3 if they specified

Example output:
Thanks for your interest! We'd love to have you. Our suite is available at ${currency} 50/night for 1 room.

|||JSON|||{"intent":"book","extracted":{"check_in":"2026-03-15","check_out":"2026-03-18","rooms_count":1}}

IMPORTANT:
- If you can't determine intent, use "unknown"
- Always include the |||JSON||| block
- For date parsing, today is ${new Date().toISOString().split("T")[0]}
- "Next weekend" means the upcoming Saturday-Sunday
- Be conversational, not robotic`;
}

export async function interpretMessage(
  text: string,
  guestState: GuestState,
  context: ConversationContext
): Promise<AIResponse> {
  const hotelId = getHotelId();
  const hotel = getHotel();
  const rooms = await getHotelRooms(hotelId);

  const roomInfo = buildRoomInfo(rooms, hotel.currency);
  const location = [hotel.location_city, hotel.location_country].filter(Boolean).join(", ") || "Ghana";

  const systemPrompt = buildSystemPrompt(
    guestState,
    context,
    roomInfo,
    hotel.name,
    hotel.currency,
    location,
    hotel.check_in_time,
    hotel.check_out_time,
  );

  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    system: systemPrompt,
    messages: [{ role: "user", content: text }],
  });

  const content =
    message.content[0].type === "text" ? message.content[0].text : "";

  // Parse the reply and JSON block
  const jsonMarker = "|||JSON|||";
  const jsonIndex = content.indexOf(jsonMarker);

  let reply: string;
  let intent: Intent = "unknown";
  let extracted: AIResponse["extracted"] = {};

  if (jsonIndex !== -1) {
    reply = content.slice(0, jsonIndex).trim();
    const jsonStr = content.slice(jsonIndex + jsonMarker.length).trim();
    try {
      const parsed = JSON.parse(jsonStr);
      intent = parsed.intent || "unknown";
      extracted = parsed.extracted || {};
    } catch {
      // JSON parse failed — use the full text as reply
      reply = content;
    }
  } else {
    reply = content;
  }

  return { intent, reply, extracted };
}
