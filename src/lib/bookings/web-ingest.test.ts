import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleBookingReport, type BookingReportStore, type ReferralBookingRow } from "@/lib/partner/booking-report";
import { memoryHotelBookings } from "./memory-store.test-helper";

const SECRET = "s3cret";

function referralStore() {
  const events = new Set<string>();
  const bookings = new Map<string, ReferralBookingRow>();
  let seq = 0;
  const store: BookingReportStore = {
    async findHotelId(slug) {
      return slug === "aracuya" ? "hotel-1" : null;
    },
    async findPartnerByRefCode(_h, code) {
      return code === "carmens-travels"
        ? { id: "p1", commission_kind: "percent", commission_value: 10, commission_currency: "USD" }
        : null;
    },
    async recordEvent(h, ref, ev) {
      const k = `${h}:${ref}:${ev}`;
      if (events.has(k)) return false;
      events.add(k);
      return true;
    },
    async forgetEvent(h, ref, ev) {
      events.delete(`${h}:${ref}:${ev}`);
    },
    async getBooking(h, ref) {
      return [...bookings.values()].find((b) => b.hotel_id === h && b.booking_ref === ref) ?? null;
    },
    async insertBooking(row) {
      const id = `r${++seq}`;
      bookings.set(id, { ...row, id, payout_status: "unpaid", payout_paid_at: null, payout_note: null, created_at: "" });
    },
    async updateBooking(id, patch) {
      bookings.set(id, { ...bookings.get(id)!, ...patch });
    },
  };
  return { store, bookings };
}

// The body aracuya.com sends (Aracuya PR #10).
const body = {
  event: "paid",
  booking_ref: "ARC-1A2B3C4D",
  ref_code: null as string | null,
  check_in: "2027-03-15",
  check_out: "2027-03-16",
  nights: 1,
  room_total_usd: 59.75,
  total_ghs: 700,
  ghs_per_usd: 11.716,
  amount_paid: 59.75,
  currency: "usd",
  paid_at: "2027-03-01T12:00:00.000Z",
  guest_name: "Test Guest",
  guest_email: "guest@example.com",
  guest_phone: "+233 24 000 0000",
  room: { id: "2", name: "2 Rooms" },
  rooms_count: 2,
  guests: 3,
};

let ref: ReturnType<typeof referralStore>;
let hb: ReturnType<typeof memoryHotelBookings>;
const call = (b: unknown) =>
  handleBookingReport({
    authHeader: `Bearer ${SECRET}`,
    secret: SECRET,
    hotelSlug: "aracuya",
    body: b,
    store: ref.store,
    hotelBookings: hb.store,
  });

beforeEach(() => {
  ref = referralStore();
  hb = memoryHotelBookings();
});

describe("website booking ingest", () => {
  it("accepts a paid booking without ref_code (null or absent) and stores it in bookings only", async () => {
    expect(await call(body)).toEqual({ status: 200, body: { ok: true, partner_found: false } });
    const noRef: Record<string, unknown> = { ...body, booking_ref: "ARC-2" };
    delete noRef.ref_code;
    expect((await call(noRef)).status).toBe(200);

    expect(ref.bookings.size).toBe(0);
    expect(hb.all()).toHaveLength(2);
    expect(hb.all()[0]).toMatchObject({
      hotel_id: "hotel-1",
      source: "aracuya_web",
      external_ref: "ARC-1A2B3C4D",
      room_slug: "suite",
      rooms_count: 2,
      guests: 3,
      guest_name: "Test Guest",
      guest_email: "guest@example.com",
      phone: "+233 24 000 0000",
      check_in: "2027-03-15",
      check_out: "2027-03-16",
      total_price: 700,
      currency: "GHS",
      payment_status: "paid",
      payment_provider: "stripe",
      booking_status: "confirmed",
      ref_code: null,
    });
  });

  it("partner booking: a bookings row and a referral row with commission", async () => {
    expect(await call({ ...body, ref_code: "Carmens-Travels" })).toEqual({
      status: 200,
      body: { ok: true, partner_found: true },
    });
    expect(hb.all()).toHaveLength(1);
    expect(hb.all()[0]).toMatchObject({ ref_code: "carmens-travels", source: "aracuya_web" });
    const [r] = [...ref.bookings.values()];
    expect(r).toMatchObject({ booking_ref: "ARC-1A2B3C4D", influencer_id: "p1", commission_amount: 5.98 });
  });

  it("is idempotent: repeats leave one row", async () => {
    await call(body);
    expect((await call(body)).body).toEqual({ ok: true, duplicate: true });
    expect(hb.all()).toHaveLength(1);
  });

  it("room.id gives the rooms count when rooms_count is missing; missing guest fields stay null", async () => {
    await call({ ...body, rooms_count: null, room: { id: "3", name: "Entire House" }, guests: null, guest_email: null, guest_phone: null, guest_name: null });
    expect(hb.all()[0]).toMatchObject({ rooms_count: 3, guests: null, guest_email: null, phone: null, guest_name: "Guest" });
  });

  it("bad guest/room details become null instead of rejecting the report; an empty ref_code string is still a 400", async () => {
    expect((await call({ ...body, rooms_count: 0, room: "2", guests: 2.5, guest_email: 42 })).status).toBe(200);
    expect(hb.all()[0]).toMatchObject({ rooms_count: 1, guests: null, guest_email: null });
    expect((await call({ ...body, booking_ref: "ARC-X", ref_code: "" })).status).toBe(400);
    expect(hb.all()).toHaveLength(1);
  });

  it("an existing row (seen on the calendar first) is completed, not duplicated", async () => {
    await hb.store.insert({
      hotel_id: "hotel-1", source: "aracuya_web", external_ref: "ARC-1A2B3C4D", guest_name: "Test Guest",
      phone: null, guest_email: null, guests: null, room_slug: "suite", rooms_count: 2,
      check_in: "2027-03-15", check_out: "2027-03-16", total_price: 0, currency: "GHS",
      payment_status: "paid", payment_provider: "stripe", booking_status: "confirmed",
      calendar_event_id: "evt1", ref_code: null, paid_at: null,
    });
    await call(body);
    expect(hb.all()).toHaveLength(1);
    expect(hb.all()[0]).toMatchObject({ calendar_event_id: "evt1", total_price: 700, guests: 3, phone: "+233 24 000 0000" });
  });

  it("cancelled / refunded mark both tables", async () => {
    await call({ ...body, ref_code: "carmens-travels" });
    await call({ event: "refunded", booking_ref: "ARC-1A2B3C4D" });
    expect(hb.all()[0]).toMatchObject({ booking_status: "cancelled", payment_status: "refunded" });
    expect([...ref.bookings.values()][0]).toMatchObject({ status: "refunded", commission_amount: 0 });

    await call({ ...body, booking_ref: "ARC-9" });
    await call({ event: "cancelled", booking_ref: "ARC-9" });
    expect(hb.all().find((r) => r.external_ref === "ARC-9")).toMatchObject({ booking_status: "cancelled", payment_status: "paid" });
    // No partner, so no referral row appears for the cancel either.
    expect(ref.bookings.size).toBe(1);
  });

  it("a refund that arrived first is not undone by the paid event", async () => {
    await call(body);
    await call({ event: "refunded", booking_ref: "ARC-1A2B3C4D" });
    await call({ ...body, paid_at: "2027-03-01T12:00:01.000Z", event: "paid" }); // duplicate event → no-op
    expect(hb.all()[0]).toMatchObject({ booking_status: "cancelled", payment_status: "refunded" });
  });
});

describe("booking alerts hook (C2)", () => {
  it("calls onHotelBooking with the row for a new report and for its cancellation, not for a repeat", async () => {
    const seen: [string, string][] = [];
    const callWith = (b: unknown) =>
      handleBookingReport({
        authHeader: `Bearer ${SECRET}`,
        secret: SECRET,
        hotelSlug: "aracuya",
        body: b,
        store: ref.store,
        hotelBookings: hb.store,
        onHotelBooking: async (h, id) => {
          seen.push([h, id]);
        },
      });
    await callWith(body);
    await callWith(body); // same event again: duplicate, no alert
    await callWith({ ...body, event: "cancelled" });
    const rowId = hb.all()[0].id;
    expect(seen).toEqual([
      ["hotel-1", rowId],
      ["hotel-1", rowId],
    ]);
  });

  it("an alert failure never fails the report", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await handleBookingReport({
      authHeader: `Bearer ${SECRET}`,
      secret: SECRET,
      hotelSlug: "aracuya",
      body,
      store: ref.store,
      hotelBookings: hb.store,
      onHotelBooking: async () => {
        throw new Error("resend down");
      },
    });
    expect(res.status).toBe(200);
    expect(hb.all()).toHaveLength(1);
    err.mockRestore();
  });
});
