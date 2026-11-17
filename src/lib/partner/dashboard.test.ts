import { describe, expect, it } from "vitest";
import type { ReferralBookingRow } from "./booking-report";
import { handlePartnerStats, type DashboardDeps } from "./dashboard";
import { membership, memoryAccountStore } from "./accounts-memory.test-helper";

const HOTELS: Record<string, { id: string; slug: string; name: string }> = {
  "hotel-a": { id: "hotel-a", slug: "aracuya", name: "Aracuya" },
  "hotel-b": { id: "hotel-b", slug: "other", name: "Other Lodge" },
};

function booking(influencerId: string, over: Partial<ReferralBookingRow> = {}): ReferralBookingRow {
  return {
    id: `b-${influencerId}`,
    hotel_id: "hotel-a",
    booking_ref: "R1",
    ref_code: "ama",
    influencer_id: influencerId,
    check_in: "2026-10-01",
    check_out: "2026-10-03",
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

function deps(store: DashboardDeps["store"]): DashboardDeps {
  const bookings: Record<string, ReferralBookingRow[]> = { "m-a": [booking("m-a")], "m-b": [] };
  const clicks: Record<string, number> = { "m-a": 12, "m-b": 3 };
  return {
    store,
    getHotel: async (id) => HOTELS[id] ?? null,
    listBookings: async (id) => bookings[id] ?? [],
    countClicks: async (id) => clicks[id] ?? 0,
    now: new Date("2026-11-17T12:00:00Z"),
  };
}

const ACC = { id: "acc", email: "ama@x.com", whatsapp: null, name: "Ama", password_hash: "hash:pw" };
const mA = membership({ id: "m-a", hotel_id: "hotel-a", slug: "ama", email: "ama@x.com", account_id: "acc" });
const mB = membership({
  id: "m-b",
  hotel_id: "hotel-b",
  slug: "ama-b",
  email: "ama@x.com",
  account_id: "acc",
  commission_kind: "per_night",
  commission_value: 100,
  created_at: "2026-11-16T00:00:00Z",
});

describe("partner dashboard", () => {
  it("no session: 401", async () => {
    const { store } = memoryAccountStore();
    expect((await handlePartnerStats(null, null, deps(store))).status).toBe(401);
  });

  it("one hotel: same fields as before P2 (link, code, rule, totals, bookings) plus clicks; one hotel listed", async () => {
    const { store } = memoryAccountStore({ accounts: [ACC], memberships: [mA] });
    const r = await handlePartnerStats({ accountId: "acc", influencerId: "m-a" }, null, deps(store));
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      name: "Ama",
      code: "ama",
      link_url: "https://aracuya.com/?ref=ama",
      currency: "GHS",
      commission_kind: "percent",
      commission_value: 15,
      clicks: 12,
      totals: { owed: 450, pending: 0, paid: 0 },
      hotel: { slug: "aracuya", name: "Aracuya" },
      hotels: [{ slug: "aracuya", name: "Aracuya" }],
    });
    const b = (r.body as { bookings: Record<string, unknown>[] }).bookings[0];
    // Partners never see guest amounts.
    expect(b).not.toHaveProperty("room_total_usd");
    expect(b).not.toHaveProperty("total_ghs");
  });

  it("two hotels: lists both, opens the session's hotel, switches with ?hotel=", async () => {
    const { store } = memoryAccountStore({ accounts: [ACC], memberships: [mA, mB] });
    const s = { accountId: "acc", influencerId: "m-a" };
    const first = await handlePartnerStats(s, null, deps(store));
    expect(first.body).toMatchObject({ code: "ama", hotels: [{ slug: "aracuya" }, { slug: "other" }] });

    const other = await handlePartnerStats(s, "other", deps(store));
    expect(other.body).toMatchObject({
      code: "ama-b",
      hotel: { slug: "other", name: "Other Lodge" },
      link_url: null, // no partner site set up for that hotel
      commission_kind: "per_night",
      clicks: 3,
      bookings: [],
      totals: { owed: 0, pending: 0, paid: 0 },
    });
  });

  it("a hotel the account is not in is ignored (falls back to the session's hotel)", async () => {
    const outsider = membership({ id: "m-x", hotel_id: "hotel-b", slug: "someone", account_id: "other-acc" });
    const { store } = memoryAccountStore({ accounts: [ACC], memberships: [mA, outsider] });
    const r = await handlePartnerStats({ accountId: "acc", influencerId: "m-a" }, "other", deps(store));
    expect(r.body).toMatchObject({ code: "ama", hotels: [{ slug: "aracuya" }] });
  });

  it("before the SQL: the session's own hotel only, as before P2", async () => {
    const { store } = memoryAccountStore({ ready: false, memberships: [{ ...mA, account_id: undefined }] });
    const r = await handlePartnerStats({ influencerId: "m-a" }, null, deps(store));
    expect(r.body).toMatchObject({ code: "ama", hotels: [{ slug: "aracuya" }] });
  });

  it("deleted partner: 404", async () => {
    const { store } = memoryAccountStore();
    expect((await handlePartnerStats({ influencerId: "gone" }, null, deps(store))).status).toBe(404);
  });
});

describe("partner dashboard: P2 sign-up and payouts", () => {
  const payout = (id: string, influencer_id: string, hotel_id: string, amount: number) => ({
    id,
    hotel_id,
    influencer_id,
    amount,
    currency: "GHS" as const,
    paid_on: "2026-11-10",
    method: "Bank transfer",
    reference: `REF-${id}`,
    created_at: "2026-11-10T00:00:00Z",
  });
  const PAYOUTS = [payout("p1", "m-a", "hotel-a", 450), payout("p2", "m-b", "hotel-b", 999), payout("p3", "m-z", "hotel-a", 77)];
  const withPayouts = (store: DashboardDeps["store"]): DashboardDeps => ({
    ...deps(store),
    listPayouts: async (id) => PAYOUTS.filter((p) => p.influencer_id === id),
  });

  it("signed-up account with no hotels: says so (200, no_hotels), no hotel data", async () => {
    const NEW = { id: "acc-new", email: "new@x.com", whatsapp: "+233241234567", name: "Kwame", password_hash: "hash:pw" };
    const { store } = memoryAccountStore({ accounts: [NEW], memberships: [mA] });
    const r = await handlePartnerStats({ accountId: "acc-new", influencerId: "" }, null, withPayouts(store));
    expect(r).toEqual({ status: 200, body: { no_hotels: true, name: "Kwame", email: "new@x.com", hotels: [] } });
  });

  it("shows only the payouts of the hotel shown, to this partner", async () => {
    const { store } = memoryAccountStore({ accounts: [ACC], memberships: [mA, mB] });
    const a = (await handlePartnerStats({ accountId: "acc", influencerId: "m-a" }, "aracuya", withPayouts(store))).body as Record<string, unknown>;
    expect(a.payouts).toEqual([{ amount: 450, currency: "GHS", paid_on: "2026-11-10", method: "Bank transfer", reference: "REF-p1" }]);
    const b = (await handlePartnerStats({ accountId: "acc", influencerId: "m-a" }, "other", withPayouts(store))).body as Record<string, unknown>;
    expect(b.payouts).toEqual([expect.objectContaining({ amount: 999, reference: "REF-p2" })]);
  });

  it("cannot see another partner's payouts, even at the same hotel", async () => {
    const other = membership({ id: "m-z", hotel_id: "hotel-a", slug: "zed", email: "zed@x.com", account_id: "acc-z" });
    const { store } = memoryAccountStore({ accounts: [ACC], memberships: [mA, mB, other] });
    for (const hotel of ["aracuya", "other", null]) {
      const body = (await handlePartnerStats({ accountId: "acc", influencerId: "m-a" }, hotel, withPayouts(store))).body as {
        payouts: { reference: string }[];
      };
      expect(body.payouts.map((p) => p.reference)).not.toContain("REF-p3");
    }
  });

  it("before the SQL: the dashboard works, payouts list is empty", async () => {
    const own = membership({ id: "m-a", hotel_id: "hotel-a", slug: "ama", email: "ama@x.com" });
    const { store } = memoryAccountStore({ ready: false, memberships: [own] });
    const r = await handlePartnerStats({ influencerId: "m-a" }, null, { ...deps(store), listPayouts: async () => [] });
    expect(r.status).toBe(200);
    expect((r.body as { payouts: unknown[] }).payouts).toEqual([]);
  });
});
