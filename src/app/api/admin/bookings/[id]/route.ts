import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin/auth";
import {
  getBookingById,
  getBookingsByGroupId,
  getHotelById,
  getHotelRoomBySlug,
  updateBooking,
  type Hotel,
} from "@/lib/db";
import { deleteBookingEvent, updateBookingEvent } from "@/lib/calendar";
import { hotelStorage } from "@/lib/hotel-context";
import { notifyGuest } from "@/lib/whatsapp/guest-notify";
import type { Booking } from "@/lib/whatsapp/types";

const VALID_TRANSITIONS: Record<string, string[]> = {
  confirmed: ["checked_in", "cancelled"],
  checked_in: ["checked_out", "cancelled"],
  checked_out: [],
  cancelled: [],
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const booking = await getBookingById(session.hotelId, id);
  if (!booking) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Include grouped bookings if any
  let groupedBookings: Booking[] = [];
  if (booking.booking_group_id) {
    groupedBookings = await getBookingsByGroupId(session.hotelId, booking.booking_group_id);
  }

  return NextResponse.json({ booking, groupedBookings });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const { action, check_in, check_out, payment_status, cancel_group } = body as {
    action?: string;
    check_in?: string;
    check_out?: string;
    payment_status?: "paid" | "refunded";
    cancel_group?: boolean;
  };

  try {
    const booking = await getBookingById(session.hotelId, id);
    if (!booking) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const hotel = await getHotelById(session.hotelId);
    if (!hotel) return NextResponse.json({ error: "Hotel not found" }, { status: 404 });

    // Status change action
    if (action && ["checked_in", "checked_out", "cancelled"].includes(action)) {
      const allowed = VALID_TRANSITIONS[booking.booking_status] || [];
      if (!allowed.includes(action)) {
        return NextResponse.json(
          { error: `Cannot transition from "${booking.booking_status}" to "${action}"` },
          { status: 400 }
        );
      }

      if (action === "cancelled") {
        // Cancel this booking
        await cancelBooking(session.hotelId, booking, hotel);

        // Cancel grouped bookings if requested
        if (cancel_group && booking.booking_group_id) {
          const grouped = await getBookingsByGroupId(session.hotelId, booking.booking_group_id);
          for (const b of grouped) {
            if (b.id !== booking.id) {
              await cancelBooking(session.hotelId, b, hotel);
            }
          }
        }
      } else {
        // Check-in or check-out
        await updateBooking(session.hotelId, id, {
          booking_status: action as Booking["booking_status"],
        });

        const event = action === "checked_in" ? "booking_checked_in" : "booking_checked_out";
        notifyGuest(session.hotelId, booking.phone, event, {
          guest_name: booking.guest_name,
        });
      }

      return NextResponse.json({ success: true });
    }

    // Date change
    if (check_in && check_out) {
      const room = await getHotelRoomBySlug(session.hotelId, booking.room_slug);
      const tier = room?.pricing_tiers.find((t) => t.rooms === booking.rooms_count);
      const nights = Math.ceil(
        (new Date(check_out).getTime() - new Date(check_in).getTime()) / 86400000
      );
      const newPrice = (tier?.price ?? 0) * nights;

      await updateBooking(session.hotelId, id, {
        check_in,
        check_out,
        total_price: newPrice,
      });

      // Update calendar event
      if (booking.calendar_event_id) {
        hotelStorage
          .run({ hotelId: session.hotelId, hotel }, () =>
            updateBookingEvent(booking.calendar_event_id!, { check_in, check_out })
          )
          .catch(() => {});
      }

      notifyGuest(session.hotelId, booking.phone, "booking_dates_changed", {
        guest_name: booking.guest_name,
        check_in,
        check_out,
        total_price: newPrice,
        currency: hotel.currency,
      });

      return NextResponse.json({ success: true, total_price: newPrice });
    }

    // Payment status change
    if (payment_status) {
      await updateBooking(session.hotelId, id, { payment_status });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "No valid action provided" }, { status: 400 });
  } catch (error) {
    console.error("Update booking error:", error);
    return NextResponse.json({ error: "Failed to update booking" }, { status: 500 });
  }
}

async function cancelBooking(
  hotelId: string,
  booking: Booking,
  hotel: Hotel
): Promise<void> {
  const updates: Partial<Booking> = { booking_status: "cancelled" };
  if (booking.payment_status === "paid") {
    updates.payment_status = "refunded";
  }
  await updateBooking(hotelId, booking.id, updates);

  // Delete calendar event
  if (booking.calendar_event_id) {
    hotelStorage
      .run({ hotelId, hotel }, () =>
        deleteBookingEvent(booking.calendar_event_id!)
      )
      .catch(() => {});
  }

  notifyGuest(hotelId, booking.phone, "booking_cancelled", {
    guest_name: booking.guest_name,
    check_in: booking.check_in,
    check_out: booking.check_out,
  });
}
