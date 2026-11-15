import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

let booking: Record<string, unknown> = {};
const updateBooking = vi.fn(async () => {});
const notifyGuest = vi.fn(async () => {});
vi.mock("@/lib/admin/auth", () => ({ getSession: async () => ({ hotelId: "h1" }) }));
vi.mock("@/lib/db", () => ({
  getBookingById: async () => booking,
  getBookingsByGroupId: async () => [],
  getHotelById: async () => ({ id: "h1", slug: "aracuya", name: "Aracuya" }),
  getHotelRoomBySlug: async () => null,
  updateBooking: (...a: unknown[]) => updateBooking(...(a as [])),
}));
vi.mock("@/lib/calendar", () => ({ deleteBookingEvent: async () => {}, updateBookingEvent: async () => {} }));
vi.mock("@/lib/whatsapp/guest-notify", () => ({ notifyGuest: (...a: unknown[]) => notifyGuest(...(a as [])) }));

const { PUT } = await import("./route");

function put(body: Record<string, unknown>) {
  return PUT(
    new NextRequest("http://localhost/api/admin/bookings/b1", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "b1" }) }
  );
}

describe("PUT /api/admin/bookings/[id] on imported bookings (C1)", () => {
  beforeEach(() => {
    updateBooking.mockClear();
    notifyGuest.mockClear();
  });

  for (const source of ["aracuya_web", "google_calendar", "airbnb", "vrbo", "booking_com"]) {
    it(`refuses changes to a ${source} booking and sends nothing`, async () => {
      booking = { id: "b1", source, booking_status: "confirmed", phone: "+233200000000", payment_provider: null };
      const res = await put({ action: "cancelled" });
      expect(res.status).toBe(409);
      expect((await res.json()).error).toMatch(/Change it in/);
      expect(updateBooking).not.toHaveBeenCalled();
      expect(notifyGuest).not.toHaveBeenCalled();
    });
  }

  it("still lets a WhatsApp booking be changed", async () => {
    booking = { id: "b1", source: null, booking_status: "confirmed", phone: "+233200000000", payment_provider: null };
    const res = await put({ payment_status: "paid" });
    expect(res.status).not.toBe(409);
    expect(updateBooking).toHaveBeenCalled();
  });
});
