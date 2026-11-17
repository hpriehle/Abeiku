import { describe, expect, it } from "vitest";
import type { ReferralBookingRow } from "./booking-report";
import { totalsFor } from "./commission";
import { bookingNote, commissionTotal, handleRecordPayout, type PayoutRow, type PayoutStore, type RecordPayoutDeps } from "./payouts";
import { PAYOUT_ADMIN } from "./p2-copy";

const NOW = new Date("2026-11-17T12:00:00Z");
const TODAY = "2026-11-17";

function booking(id: string, over: Partial<ReferralBookingRow> = {}): ReferralBookingRow {
  return {
    id,
    hotel_id: "hotel-a",
    booking_ref: id.toUpperCase(),
    ref_code: "ama",
    influencer_id: "m-a",
    check_in: "2026-10-01",
    check_out: "2026-10-03", // past: owed
    nights: 2,
    room_total_usd: 200,
    total_ghs: 3000,
    status: "paid",
    commission_amount: 450,
    commission_currency: "GHS",
    payout_status: "unpaid",
    payout_paid_at: null,
    payout_note: null,
    ...over,
  } as ReferralBookingRow;
}

function setup(ready = true) {
  const bookings: (ReferralBookingRow & { payout_id?: string | null })[] = [
    booking("b1"),
    booking("b2", { commission_amount: 300 }),
    booking("b3", { check_out: "2026-12-01" }), // pending: guest not checked out
    booking("b4", { status: "refunded" }),
    booking("bx", { hotel_id: "hotel-b", influencer_id: "m-b" }), // other hotel's partner
  ];
  const payouts: (PayoutRow & { recorded_by: string | null })[] = [];
  let seq = 0;
  const store: PayoutStore = {
    ready: async () => ready,
    async insert(row) {
      const p = { ...row, id: `p${++seq}`, created_at: NOW.toISOString() };
      payouts.push(p);
      return p;
    },
    async remove(id) {
      payouts.splice(payouts.findIndex((p) => p.id === id), 1);
    },
    async markBookingsPaid(influencerId, ids, payout) {
      let n = 0;
      for (const b of bookings) {
        if (ids.includes(b.id) && b.influencer_id === influencerId && b.payout_status === "unpaid") {
          Object.assign(b, { payout_status: "paid", payout_paid_at: payout.paid_on, payout_note: payout.note, payout_id: payout.id });
          n++;
        }
      }
      return n;
    },
    listForPartner: async (id) => payouts.filter((p) => p.influencer_id === id),
    listForHotel: async (id) => payouts.filter((p) => p.hotel_id === id),
  };
  const partners: Record<string, { id: string; hotel_id: string; name: string }> = {
    "m-a": { id: "m-a", hotel_id: "hotel-a", name: "Ama" },
    "m-b": { id: "m-b", hotel_id: "hotel-b", name: "Kofi" },
  };
  const deps: RecordPayoutDeps = {
    payouts: store,
    getPartner: async (id) => partners[id] ?? null,
    listBookings: async (id) => bookings.filter((b) => b.influencer_id === id).map((b) => ({ ...b })),
    now: NOW,
  };
  return { deps, bookings, payouts, store };
}

const ADMIN_A = { hotelId: "hotel-a", userId: "u1" };
const BODY = { booking_ids: ["b1", "b2"], amount: 750, currency: "GHS", paid_on: TODAY, method: "Bank transfer", reference: "GCB-123" };

describe("hotel-recorded payouts", () => {
  it("records the payout and marks the ticked owed bookings paid", async () => {
    const t = setup();
    const r = await handleRecordPayout(ADMIN_A, "m-a", BODY, t.deps);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, marked: 2, payout: { amount: 750, currency: "GHS", partner_name: "Ama" } });
    expect(t.payouts).toEqual([
      expect.objectContaining({ hotel_id: "hotel-a", influencer_id: "m-a", amount: 750, paid_on: TODAY, method: "Bank transfer", reference: "GCB-123", recorded_by: "u1" }),
    ]);
    for (const id of ["b1", "b2"]) {
      expect(t.bookings.find((b) => b.id === id)).toMatchObject({
        payout_status: "paid",
        payout_paid_at: TODAY,
        payout_note: "Bank transfer · GCB-123",
        payout_id: "p1",
      });
    }
  });

  it("owed vs paid: only the ticked bookings move from owed to paid", async () => {
    const t = setup();
    const mine = () => t.bookings.filter((b) => b.influencer_id === "m-a").map((b) => ({ ...b, commission_amount: Number(b.commission_amount) }));
    expect(totalsFor(mine(), TODAY)).toEqual({ pending: 450, owed: 750, paid: 0 });
    await handleRecordPayout(ADMIN_A, "m-a", { ...BODY, booking_ids: ["b2"], amount: 300 }, t.deps);
    expect(totalsFor(mine(), TODAY)).toEqual({ pending: 450, owed: 450, paid: 300 });
    await handleRecordPayout(ADMIN_A, "m-a", { ...BODY, booking_ids: ["b1"], amount: 450 }, t.deps);
    expect(totalsFor(mine(), TODAY)).toEqual({ pending: 450, owed: 0, paid: 750 });
    // The form's prefilled amount is the commission of the ticked bookings.
    expect(commissionTotal([{ id: "b1", commission: 450 }, { id: "b2", commission: 300.1 }], ["b1", "b2"])).toBe(750.1);
  });

  it("the amount actually sent may differ (rounding, other currency); it is kept as sent", async () => {
    const t = setup();
    const r = await handleRecordPayout(ADMIN_A, "m-a", { ...BODY, amount: 50.005, currency: "USD", reference: "" }, t.deps);
    expect(r.status).toBe(200);
    expect(t.payouts[0]).toMatchObject({ amount: 50.01, currency: "USD", reference: null });
    expect(t.bookings.find((b) => b.id === "b1")!.payout_note).toBe("Bank transfer");
  });

  it("only owed bookings of this partner can be covered", async () => {
    const t = setup();
    for (const ids of [["b3"], ["b4"], ["bx"], ["nope"], ["b1", "b3"]]) {
      const r = await handleRecordPayout(ADMIN_A, "m-a", { ...BODY, booking_ids: ids }, t.deps);
      expect(r).toEqual({ status: 409, body: { error: PAYOUT_ADMIN.errNotOwed } });
    }
    await handleRecordPayout(ADMIN_A, "m-a", BODY, t.deps);
    // Already paid now: a second payout for the same bookings is refused.
    expect((await handleRecordPayout(ADMIN_A, "m-a", BODY, t.deps)).status).toBe(409);
    expect(t.payouts).toHaveLength(1);
  });

  it("a hotel cannot record a payout for another hotel's partner", async () => {
    const t = setup();
    const r = await handleRecordPayout(ADMIN_A, "m-b", { ...BODY, booking_ids: ["bx"] }, t.deps);
    expect(r).toEqual({ status: 404, body: { error: "Not found" } });
    expect(t.payouts).toHaveLength(0);
  });

  it("checks the form", async () => {
    const t = setup();
    const bad = async (over: object) => (await handleRecordPayout(ADMIN_A, "m-a", { ...BODY, ...over }, t.deps)).body;
    expect(await bad({ booking_ids: [] })).toEqual({ error: PAYOUT_ADMIN.errBookings });
    expect(await bad({ amount: 0 })).toEqual({ error: PAYOUT_ADMIN.errAmount });
    expect(await bad({ amount: "abc" })).toEqual({ error: PAYOUT_ADMIN.errAmount });
    expect(await bad({ currency: "EUR" })).toMatchObject({ error: expect.any(String) });
    expect(await bad({ paid_on: "2026-12-25" })).toEqual({ error: PAYOUT_ADMIN.errDate });
    expect(await bad({ paid_on: "yesterday" })).toEqual({ error: PAYOUT_ADMIN.errDate });
    expect(await bad({ method: "  " })).toEqual({ error: PAYOUT_ADMIN.errMethod });
    expect(t.payouts).toHaveLength(0);
  });

  it("before the SQL: 503 and nothing changes", async () => {
    const t = setup(false);
    const r = await handleRecordPayout(ADMIN_A, "m-a", BODY, t.deps);
    expect(r).toEqual({ status: 503, body: { error: PAYOUT_ADMIN.errNotReady } });
    expect(t.bookings.every((b) => b.payout_status === "unpaid")).toBe(true);
  });

  it("if marking the bookings fails, the payout row is taken back", async () => {
    const t = setup();
    t.deps.payouts = { ...t.store, markBookingsPaid: async () => { throw new Error("db down"); } };
    await expect(handleRecordPayout(ADMIN_A, "m-a", BODY, t.deps)).rejects.toThrow("db down");
    expect(t.payouts).toHaveLength(0);
  });

  it("booking note", () => {
    expect(bookingNote("Bank transfer", null)).toBe("Bank transfer");
    expect(bookingNote("Bank transfer", "REF1")).toBe("Bank transfer · REF1");
  });
});
