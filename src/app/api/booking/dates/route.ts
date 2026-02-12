import { NextRequest, NextResponse } from "next/server";
import {
  getHotelBySlug,
  getConversation,
  upsertConversation,
  getHotelRoomBySlug,
  getRoomAvailability,
} from "@/lib/db";
import { hotelStorage } from "@/lib/hotel-context";
import {
  trackedSendText as sendText,
  trackedSendList as sendList,
  trackedSendButtons as sendButtons,
  setTrackingContext,
  clearTrackingContext,
} from "@/lib/whatsapp/tracked-client";
import { simulatorStorage, type SimulatorContext } from "@/lib/whatsapp/simulator-context";
import type { ConversationContext } from "@/lib/whatsapp/types";

const fmtDate = (d: string) => {
  const date = new Date(d + "T00:00:00");
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

const fmtDateShort = (d: string) => {
  const date = new Date(d + "T00:00:00");
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { hotel: hotelSlug, phone, checkIn, checkOut } = body;

    // room + count = Path B (room first); guests = Path A (dates first)
    const roomSlug: string | undefined = body.room;
    const count: number | undefined = body.count;
    const guests: number | undefined = body.guests;
    const sim: boolean = !!body.sim;

    if (!hotelSlug || !phone || !checkIn || !checkOut) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Validate dates
    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (isNaN(checkInDate.getTime()) || isNaN(checkOutDate.getTime())) {
      return NextResponse.json({ error: "Invalid dates" }, { status: 400 });
    }

    if (checkInDate < today) {
      return NextResponse.json({ error: "Check-in must be today or later" }, { status: 400 });
    }

    if (checkOutDate <= checkInDate) {
      return NextResponse.json({ error: "Check-out must be after check-in" }, { status: 400 });
    }

    const nights = Math.ceil(
      (checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Fetch hotel
    const hotel = await getHotelBySlug(hotelSlug);
    if (!hotel) {
      return NextResponse.json({ error: "Hotel not found" }, { status: 404 });
    }

    // Run inside hotel context so WhatsApp client can access credentials
    const simContext: SimulatorContext | null = sim ? { messages: [] } : null;

    const runHandler = () => hotelStorage.run({ hotelId: hotel.id, hotel }, async () => {
      const conversation = await getConversation(hotel.id, phone);
      const context: ConversationContext = conversation?.context ?? {};

      // Set tracking context so messages get logged to chat_messages
      setTrackingContext({
        conversationId: conversation?.id ?? "",
        phone,
        guestState: conversation?.guest_state,
        step: conversation?.step,
      });

      try {
        if (roomSlug) {
          return await handlePathB(hotel, phone, roomSlug, count || context.rooms_count || 1, checkIn, checkOut, nights, context);
        } else {
          const guestCount = guests || (context.guest_count as number) || 1;
          return await handlePathA(hotel, phone, guestCount, checkIn, checkOut, nights, context);
        }
      } finally {
        clearTrackingContext();
      }
    });

    // Wrap in simulator context if sim mode (captures messages instead of sending to Meta)
    const result = simContext
      ? await simulatorStorage.run(simContext, runHandler)
      : await runHandler();

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ success: true, whatsapp_number: hotel.whatsapp_display_phone ?? hotel.contact_phone ?? null });
  } catch (err) {
    console.error("Date submission error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// Path A: dates first — find available rooms and send list via WhatsApp
async function handlePathA(
  hotel: { id: string; currency: string; slug: string },
  phone: string,
  guestCount: number,
  checkIn: string,
  checkOut: string,
  nights: number,
  context: ConversationContext,
): Promise<{ success: true } | { error: string; status: number }> {
  const availability = await getRoomAvailability(hotel.id, checkIn, checkOut);

  // Filter: rooms with availability that can fit the guest count
  const available = availability
    .map(({ room, availableRooms }) => {
      const tiers = room.pricing_tiers.filter(
        (tier) => tier.rooms <= availableRooms && tier.rooms * room.occupancy >= guestCount
      );
      return tiers.length > 0 ? { room, tiers } : null;
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  // Save dates to context
  context.check_in = checkIn;
  context.check_out = checkOut;
  context.guest_count = guestCount;

  if (available.length === 0) {
    // No rooms available — keep step at date_selection so they can retry
    await upsertConversation(hotel.id, phone, { step: "date_selection", context });

    try {
      await sendText(
        phone,
        `Sorry, no rooms are available for ${fmtDateShort(checkIn)} → ${fmtDateShort(checkOut)} with ${guestCount} guest${guestCount > 1 ? "s" : ""}. Please try different dates.`
      );
      await sendButtons(phone, "What would you like to do?", [
        { id: "pick_dates", title: "Try Different Dates" },
        { id: "contact_us", title: "Contact Us" },
      ]);
    } catch {
      // WhatsApp send failed — dates are saved, page shows success
    }

    return { success: true };
  }

  // Rooms available — advance to room_selection
  await upsertConversation(hotel.id, phone, { step: "room_selection", context });

  try {
    const sections = available.map(({ room, tiers }) => ({
      title: room.name,
      rows: tiers.map((tier) => ({
        id: `room_${room.slug}_${tier.rooms}`,
        title: tier.label,
        description: `${hotel.currency} ${tier.price}/night · ${nights} nights · Total: ${hotel.currency} ${tier.price * nights}`,
      })),
    }));

    const roomSummaries = available
      .map(
        ({ room }) =>
          `*${room.name}*${room.tagline ? ` — ${room.tagline}` : ""}\n🛏️ ${room.bed_type || "Comfortable beds"} · 👥 Up to ${room.occupancy} guests`
      )
      .join("\n\n");

    await sendList(
      phone,
      `📅 *${fmtDateShort(checkIn)} → ${fmtDateShort(checkOut)}* (${nights} night${nights > 1 ? "s" : ""})\n\n${roomSummaries}\n\nSelect a room below:`,
      "Choose Room",
      sections,
      "Available Rooms"
    );
  } catch {
    // WhatsApp send failed — dates are saved, user can return to WhatsApp
  }

  return { success: true };
}

// Path B: room first → check availability for that specific room, calculate price
async function handlePathB(
  hotel: { id: string; currency: string; slug: string },
  phone: string,
  roomSlug: string,
  roomsCount: number,
  checkIn: string,
  checkOut: string,
  nights: number,
  context: ConversationContext,
): Promise<{ success: true } | { error: string; status: number }> {
  // Check availability for this specific room
  const availability = await getRoomAvailability(hotel.id, checkIn, checkOut);
  const roomAvail = availability.find((a) => a.room.slug === roomSlug);

  if (!roomAvail || roomAvail.availableRooms < roomsCount) {
    return {
      error: "That room isn't available for those dates. Please try different dates.",
      status: 409,
    };
  }

  const room = await getHotelRoomBySlug(hotel.id, roomSlug);
  const tier = room?.pricing_tiers.find((t) => t.rooms === roomsCount);
  const totalPrice = (tier?.price ?? 0) * nights;

  // Update conversation context and advance to guest_info step
  context.check_in = checkIn;
  context.check_out = checkOut;
  context.total_price = totalPrice;
  context.selected_room = roomSlug;
  context.rooms_count = roomsCount;

  await upsertConversation(hotel.id, phone, {
    step: "guest_info",
    context,
  });

  // Send WhatsApp message confirming dates and asking for name
  try {
    await sendText(
      phone,
      `✅ Dates confirmed!\n\n📅 *${fmtDate(checkIn)}* → *${fmtDate(checkOut)}* (${nights} night${nights > 1 ? "s" : ""})\n💰 Total: *${hotel.currency} ${totalPrice}*\n\nWhat name should the booking be under?`
    );
  } catch {
    // WhatsApp send failed — dates are saved, flow continues
  }

  return { success: true };
}
