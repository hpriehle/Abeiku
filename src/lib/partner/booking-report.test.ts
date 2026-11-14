import { beforeEach, describe, expect, it } from "vitest";
import {
  handleBookingReport,
  isAuthorized,
  type BookingReportStore,
  type PartnerRule,
  type ReferralBookingRow,
} from "./booking-report";

const SECRET = "test-secret-123";
const AUTH = `Bearer ${SECRET}`;

function memoryStore() {
  const hotels = new Map([["aracuya", "hotel-1"]]);
  const partners = new Map<string, PartnerRule>([
    ["hotel-1:kofi-tours", { id: "p-agency-gh", commission_kind: "percent", commission_value: 15, commission_currency: "GHS" }],
    ["hotel-1:london-trips", { id: "p-agency-us", commission_kind: "percent", commission_value: 15, commission_currency: "USD" }],
    ["hotel-1:ama", { id: "p-local", commission_kind: "per_night", commission_value: 150, commission_currency: "GHS" }],
  ]);
  const events = new Set<string>();
  const bookings = new Map<string, ReferralBookingRow>();
  let seq = 0;

  const store: BookingReportStore = {
    async findHotelId(slug) {
      return hotels.get(slug) ?? null;
    },
    async findPartnerByRefCode(hotelId, code) {
      return partners.get(`${hotelId}:${code.toLowerCase()}`) ?? null;
    },
    async recordEvent(hotelId, ref, event) {
      const k = `${hotelId}:${ref}:${event}`;
      if (events.has(k)) return false;
      events.add(k);
      return true;
    },
    async forgetEvent(hotelId, ref, event) {
      events.delete(`${hotelId}:${ref}:${event}`);
    },
    async getBooking(hotelId, ref) {
      return [...bookings.values()].find((b) => b.hotel_id === hotelId && b.booking_ref === ref) ?? null;
    },
    async insertBooking(row) {
      if ([...bookings.values()].some((b) => b.hotel_id === row.hotel_id && b.booking_ref === row.booking_ref)) {
        throw new Error("unique violation");
      }
      const id = `b${++seq}`;
      bookings.set(id, {
        ...row,
        id,
        payout_status: "unpaid",
        payout_paid_at: null,
        payout_note: null,
        created_at: new Date().toISOString(),
      });
    },
    async updateBooking(id, patch) {
      const b = bookings.get(id)!;
      bookings.set(id, { ...b, ...patch });
    },
  };
  return { store, bookings, events };
}

const paidBody = {
  event: "paid",
  booking_ref: "ARA-1001",
  ref_code: "KOFI-TOURS",
  check_in: "2026-12-20",
  check_out: "2026-12-23",
  nights: 3,
  room_total_usd: 600,
  total_ghs: 9000,
  ghs_per_usd: 15,
  amount_paid: 600,
  currency: "usd",
  paid_at: "2026-11-14T10:00:00Z",
};

let mem: ReturnType<typeof memoryStore>;
const call = (body: unknown, authHeader: string | null = AUTH, hotelSlug = "aracuya") =>
  handleBookingReport({ authHeader, secret: SECRET, hotelSlug, body, store: mem.store });

beforeEach(() => {
  mem = memoryStore();
});

describe("auth", () => {
  it("accepts only the exact bearer secret", () => {
    expect(isAuthorized(AUTH, SECRET)).toBe(true);
    expect(isAuthorized(`bearer ${SECRET}`, SECRET)).toBe(true);
    expect(isAuthorized(`Bearer ${SECRET}x`, SECRET)).toBe(false);
    expect(isAuthorized(SECRET, SECRET)).toBe(false);
    expect(isAuthorized(null, SECRET)).toBe(false);
    expect(isAuthorized("Bearer ", SECRET)).toBe(false);
  });

  it("rejects everything when no secret is configured", () => {
    expect(isAuthorized("Bearer ", undefined)).toBe(false);
    expect(isAuthorized("Bearer anything", "")).toBe(false);
  });

  it("returns 401 before touching the store", async () => {
    const res = await call(paidBody, "Bearer wrong");
    expect(res.status).toBe(401);
    expect(mem.bookings.size).toBe(0);
    expect(mem.events.size).toBe(0);
    expect((await call(null, null)).status).toBe(401);
  });
});

describe("validation", () => {
  it("400 on bad bodies", async () => {
    expect((await call(null)).status).toBe(400);
    expect((await call([])).status).toBe(400);
    expect((await call({ ...paidBody, event: "booked" })).status).toBe(400);
    expect((await call({ ...paidBody, booking_ref: "" })).status).toBe(400);
    expect((await call({ ...paidBody, nights: "three" })).status).toBe(400);
    expect((await call({ ...paidBody, nights: 2.5 })).status).toBe(400);
    expect((await call({ ...paidBody, check_out: "soon" })).status).toBe(400);
    expect((await call({ ...paidBody, check_out: "2026-12-01" })).status).toBe(400);
    expect((await call({ ...paidBody, room_total_usd: undefined, total_ghs: undefined })).status).toBe(400);
    expect((await call({ ...paidBody, ref_code: "" })).status).toBe(400);
    expect(mem.bookings.size).toBe(0);
  });

  it("refund only needs event + booking_ref", async () => {
    expect((await call({ event: "refunded", booking_ref: "X" })).status).toBe(200);
  });

  it("404 for an unknown hotel", async () => {
    expect((await call(paidBody, AUTH, "nope")).status).toBe(404);
  });
});

describe("paid events", () => {
  it("records the booking with commission in the partner's currency", async () => {
    const res = await call(paidBody);
    expect(res).toEqual({ status: 200, body: { ok: true, partner_found: true } });
    const [b] = [...mem.bookings.values()];
    expect(b).toMatchObject({
      booking_ref: "ARA-1001",
      influencer_id: "p-agency-gh",
      ref_code: "kofi-tours",
      status: "paid",
      commission_amount: 1350,
      commission_currency: "GHS",
      currency: "USD",
      nights: 3,
    });
  });

  it("USD agency gets 15% of room_total_usd; local gets 150 x nights", async () => {
    await call({ ...paidBody, booking_ref: "A", ref_code: "london-trips" });
    await call({ ...paidBody, booking_ref: "B", ref_code: "ama" });
    const rows = [...mem.bookings.values()];
    expect(rows.find((r) => r.booking_ref === "A")).toMatchObject({ commission_amount: 90, commission_currency: "USD" });
    expect(rows.find((r) => r.booking_ref === "B")).toMatchObject({ commission_amount: 450, commission_currency: "GHS" });
  });

  it("is idempotent: the second identical call is a no-op 200", async () => {
    await call(paidBody);
    const second = await call(paidBody);
    expect(second).toEqual({ status: 200, body: { ok: true, duplicate: true } });
    expect(mem.bookings.size).toBe(1);
  });

  it("records unknown ref codes with no partner and returns 200", async () => {
    const res = await call({ ...paidBody, ref_code: "Mystery" });
    expect(res).toEqual({ status: 200, body: { ok: true, partner_found: false } });
    const [b] = [...mem.bookings.values()];
    expect(b).toMatchObject({ influencer_id: null, ref_code: "mystery", commission_amount: 0, commission_currency: null });
  });

  it("forgets the event when storing fails, so a retry is processed", async () => {
    const realInsert = mem.store.insertBooking;
    mem.store.insertBooking = async () => {
      throw new Error("db down");
    };
    await expect(call(paidBody)).rejects.toThrow("db down");
    mem.store.insertBooking = realInsert;
    expect((await call(paidBody)).body).toEqual({ ok: true, partner_found: true });
    expect(mem.bookings.size).toBe(1);
  });
});

describe("refund / cancel events", () => {
  it("refund after paid sets status and zeroes commission; repeat is a no-op", async () => {
    await call(paidBody);
    expect((await call({ event: "refunded", booking_ref: "ARA-1001" })).status).toBe(200);
    const [b] = [...mem.bookings.values()];
    expect(b).toMatchObject({ status: "refunded", commission_amount: 0 });
    expect((await call({ event: "refunded", booking_ref: "ARA-1001" })).body).toEqual({ ok: true, duplicate: true });
  });

  it("refund arriving before paid is not undone by the later paid event", async () => {
    await call({ event: "cancelled", booking_ref: "ARA-1001", ref_code: "kofi-tours" });
    await call(paidBody);
    const [b] = [...mem.bookings.values()];
    expect(b).toMatchObject({ status: "cancelled", commission_amount: 0, influencer_id: "p-agency-gh", nights: 3 });
    expect(mem.bookings.size).toBe(1);
  });

  it("keeps the commission if the payout was already made", async () => {
    await call(paidBody);
    const [b] = [...mem.bookings.values()];
    await mem.store.updateBooking(b.id, { payout_status: "paid", payout_paid_at: "2026-12-30" });
    await call({ event: "refunded", booking_ref: "ARA-1001" });
    expect(mem.bookings.get(b.id)).toMatchObject({ status: "refunded", commission_amount: 1350, payout_status: "paid" });
  });
});
