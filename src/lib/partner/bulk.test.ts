import { describe, expect, it } from "vitest";
import {
  handleBulkUpsert,
  handleListPartners,
  parseBulkItem,
  type PartnerAdminStore,
  type PartnerBookingRow,
  type PartnerRecord,
} from "./bulk";
import { codeFromName, dedupeCode, normalizeWhatsapp } from "./codes";

const SECRET = "test-admin-secret";
const AUTH = `Bearer ${SECRET}`;
const NOW = new Date("2026-11-14T12:00:00Z");

function memoryStore(opts: { failInsertFor?: string } = {}) {
  const partners: PartnerRecord[] = [];
  const bookings: PartnerBookingRow[] = [];
  const otherHotelEmails = new Set(["taken@elsewhere.com"]);
  let seq = 0;
  const calls = { insert: 0, update: 0 };

  const store: PartnerAdminStore = {
    async findHotelId(slug) {
      return slug === "aracuya" ? "hotel-1" : null;
    },
    async listPartners(hotelId) {
      return partners.filter((p) => p.hotel_id === hotelId).map((p) => ({ ...p }));
    },
    async findByEmail(email) {
      if (otherHotelEmails.has(email)) return { id: "other", hotel_id: "hotel-2" };
      const p = partners.find((x) => x.email === email);
      return p ? { id: p.id, hotel_id: p.hotel_id } : null;
    },
    async insertPartner(row) {
      calls.insert++;
      if (opts.failInsertFor && row.name === opts.failInsertFor) throw { code: "23505", message: "dup" };
      const p: PartnerRecord = { ...row, id: `p${++seq}`, password_hash: null };
      partners.push(p);
      return { ...p };
    },
    async updatePartner(id, patch) {
      calls.update++;
      const p = partners.find((x) => x.id === id)!;
      Object.assign(p, patch);
      return { ...p };
    },
    async listBookings() {
      return bookings;
    },
  };
  return { store, partners, bookings, calls };
}

let tokenSeq = 0;
const newToken = () => `tok${++tokenSeq}`;

function bulk(store: PartnerAdminStore, partners: unknown[], now = NOW, auth: string | null = AUTH) {
  return handleBulkUpsert({ authHeader: auth, secret: SECRET, body: { hotel_slug: "aracuya", partners }, store, now, newToken });
}

type Body = { results: Array<Record<string, unknown>>; counts: Record<string, number> };

const carmen = {
  name: "Carmen's Travels",
  type: "agency",
  town: "Accra",
  whatsapp: "+233 24 123 4567",
  email: "carmen@example.com",
  country: "Ghana",
};

describe("codeFromName / dedupeCode", () => {
  it("makes lowercase hyphenated codes", () => {
    expect(codeFromName("Carmen's Travels")).toBe("carmen-travels");
    expect(codeFromName("Kofi & Ama Tours Ltd.")).toBe("kofi-ama-tours-ltd");
    expect(codeFromName("  Ésther   Owusu ")).toBe("esther-owusu");
    expect(codeFromName("Joe’s")).toBe("joe");
    expect(codeFromName("!!")).toBe("partner");
    expect(codeFromName("A".repeat(80)).length).toBeLessThanOrEqual(36);
  });

  it("adds -2, -3 when taken (case-insensitive)", () => {
    expect(dedupeCode("carmen-travels", [])).toBe("carmen-travels");
    expect(dedupeCode("carmen-travels", ["Carmen-Travels"])).toBe("carmen-travels-2");
    expect(dedupeCode("carmen-travels", ["carmen-travels", "carmen-travels-2"])).toBe("carmen-travels-3");
  });

  it("keeps deduped codes within 40 chars", () => {
    const long = "a".repeat(40);
    const c = dedupeCode(long, [long]);
    expect(c).toBe("a".repeat(38) + "-2");
  });

  it("normalizes WhatsApp numbers to E.164", () => {
    expect(normalizeWhatsapp("+233 24 123-4567")).toBe("+233241234567");
    expect(normalizeWhatsapp("00233241234567")).toBe("+233241234567");
    expect(normalizeWhatsapp("0241234567")).toBeNull();
    expect(normalizeWhatsapp("+0123")).toBeNull();
  });
});

describe("parseBulkItem", () => {
  it("needs whatsapp or email", () => {
    const r = parseBulkItem({ name: "X Y", type: "agency", country: "Ghana" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("whatsapp or email");
  });
  it("rejects bad type, bad rule, bad code", () => {
    const r = parseBulkItem({
      name: "X",
      type: "hotel",
      country: "Ghana",
      email: "x@y.com",
      code: "no spaces!",
      rule: { kind: "percent", value: 150 },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("type");
      expect(r.error).toContain("code");
      expect(r.error).toContain("100 or less");
    }
  });
});

describe("auth", () => {
  it("rejects missing or wrong secret, and everything when unset", async () => {
    const { store, calls } = memoryStore();
    expect((await bulk(store, [carmen], NOW, null)).status).toBe(401);
    expect((await bulk(store, [carmen], NOW, "Bearer wrong")).status).toBe(401);
    const unset = await handleBulkUpsert({
      authHeader: "Bearer ",
      secret: undefined,
      body: { hotel_slug: "aracuya", partners: [carmen] },
      store,
    });
    expect(unset.status).toBe(401);
    const list = await handleListPartners({ authHeader: AUTH, secret: "", hotelSlug: "aracuya", store });
    expect(list.status).toBe(401);
    expect(calls.insert).toBe(0);
  });

  it("list works with the right secret", async () => {
    const { store } = memoryStore();
    const r = await handleListPartners({ authHeader: AUTH, secret: SECRET, hotelSlug: "aracuya", store });
    expect(r.status).toBe(200);
  });

  it("400 on bad body, 404 on unknown hotel", async () => {
    const { store } = memoryStore();
    expect((await handleBulkUpsert({ authHeader: AUTH, secret: SECRET, body: null, store })).status).toBe(400);
    expect(
      (await handleBulkUpsert({ authHeader: AUTH, secret: SECRET, body: { hotel_slug: "aracuya", partners: [] }, store }))
        .status
    ).toBe(400);
    expect(
      (await handleBulkUpsert({ authHeader: AUTH, secret: SECRET, body: { hotel_slug: "nope", partners: [carmen] }, store }))
        .status
    ).toBe(404);
  });
});

describe("bulk upsert", () => {
  it("creates partners with generated codes, links and default rules", async () => {
    const { store, partners } = memoryStore();
    const r = await bulk(store, [
      carmen,
      { name: "Carmen Travels", type: "local", whatsapp: "+233200000001", country: "Ghana", town: "Cape Coast" },
      { name: "Sam in London", type: "agency", email: "sam@example.co.uk", country: "United Kingdom" },
    ]);
    expect(r.status).toBe(200);
    const body = r.body as Body;
    expect(body.counts).toEqual({ created: 3, updated: 0, error: 0 });
    expect(body.results[0]).toMatchObject({
      name: "Carmen's Travels",
      code: "carmen-travels",
      ref_link: "https://aracuya.com/?ref=carmen-travels",
      status: "created",
    });
    expect(body.results[0].setup_link).toMatch(/\/partner\/setup\?token=tok\d+$/);
    expect(body.results[1].code).toBe("carmen-travels-2");

    expect(partners[0]).toMatchObject({
      whatsapp: "+233241234567",
      email: "carmen@example.com",
      town: "Accra",
      currency: "GHS",
      commission_kind: "percent",
      commission_value: 15,
    });
    expect(partners[1]).toMatchObject({ commission_kind: "per_night", commission_value: 150, email: null });
    expect(partners[2]).toMatchObject({ currency: "USD", commission_currency: "USD", commission_value: 15 });
  });

  it("is idempotent: same whatsapp or email updates, keeps code and a valid token", async () => {
    const { store, partners, calls } = memoryStore();
    const first = (await bulk(store, [carmen])).body as Body;
    const link = first.results[0].setup_link;

    // Same WhatsApp, new name/town, no email.
    const again = (await bulk(store, [
      { name: "Carmen Travel & Tours", type: "agency", whatsapp: "+233241234567", country: "Ghana", town: "Kumasi" },
    ])).body as Body;
    expect(again.results[0]).toMatchObject({ status: "updated", code: "carmen-travels", setup_link: link });

    // Same email, different number format.
    const third = (await bulk(store, [{ ...carmen, whatsapp: "00233241234567", email: "CARMEN@example.com" }])).body as Body;
    expect(third.results[0]).toMatchObject({ status: "updated", code: "carmen-travels", setup_link: link });

    expect(partners).toHaveLength(1);
    expect(calls.insert).toBe(1);
    expect(partners[0]).toMatchObject({ town: "Accra", email: "carmen@example.com" });
  });

  it("issues a new setup link only after the old one expired, none once set up", async () => {
    const { store, partners } = memoryStore();
    const first = (await bulk(store, [carmen])).body as Body;
    const later = new Date(NOW.getTime() + 15 * 24 * 3600 * 1000);
    const renewed = (await bulk(store, [carmen], later)).body as Body;
    expect(renewed.results[0].setup_link).not.toBe(first.results[0].setup_link);
    expect(renewed.results[0].setup_link).toBeTruthy();

    partners[0].password_hash = "hash";
    const done = (await bulk(store, [carmen], later)).body as Body;
    expect(done.results[0]).toMatchObject({ status: "updated", setup_link: null });
  });

  it("dedupes within one batch: duplicate whatsapp updates the one just created", async () => {
    const { store, partners } = memoryStore();
    const r = (await bulk(store, [carmen, { ...carmen, email: undefined, town: "Tema" }])).body as Body;
    expect(r.results.map((x) => x.status)).toEqual(["created", "updated"]);
    expect(partners).toHaveLength(1);
    expect(partners[0].town).toBe("Tema");
  });

  it("partial failure: bad items are reported, the rest go through", async () => {
    const { store, partners } = memoryStore({ failInsertFor: "Db Fails" });
    const r = await bulk(store, [
      carmen,
      { name: "No Contact", type: "agency", country: "Ghana" },
      { name: "Influ", type: "influencer", whatsapp: "+233200000002", country: "Ghana" },
      { name: "Local Abroad", type: "local", whatsapp: "+447700900123", country: "UK" },
      { name: "Elsewhere", type: "agency", email: "taken@elsewhere.com", country: "Ghana" },
      { name: "Clash", type: "agency", email: "clash@example.com", country: "Ghana", code: "carmen-travels" },
      { name: "Db Fails", type: "agency", whatsapp: "+233200000003", country: "Ghana" },
      "not an object",
      {
        name: "Ama Influencer",
        type: "influencer",
        whatsapp: "+233200000004",
        country: "Ghana",
        code: "Ama-Vibes",
        rule: { kind: "per_night", value: 100 },
        ghl_contact_id: "ghl-123",
      },
    ]);
    expect(r.status).toBe(200);
    const body = r.body as Body;
    expect(body.results.map((x) => x.status)).toEqual([
      "created", "error", "error", "error", "error", "error", "error", "error", "created",
    ]);
    expect(body.counts).toEqual({ created: 2, updated: 0, error: 7 });
    expect(body.results[1].error).toContain("whatsapp or email");
    expect(body.results[2].error).toContain("rule is required for type influencer");
    expect(body.results[3].error).toContain("outside Ghana");
    expect(body.results[4].error).toContain("another hotel");
    expect(body.results[5].error).toContain("already in use");
    expect(body.results[6].error).toContain("conflicts");
    expect(body.results[8]).toMatchObject({ code: "ama-vibes", ref_link: "https://aracuya.com/?ref=ama-vibes" });
    expect(partners.map((p) => p.slug)).toEqual(["carmen-travels", "ama-vibes"]);
    expect(partners[1]).toMatchObject({ commission_kind: "per_night", commission_value: 100, ghl_contact_id: "ghl-123" });
  });

  it("refuses to change an existing code and to merge two different partners", async () => {
    const { store } = memoryStore();
    await bulk(store, [carmen, { name: "Kofi", type: "agency", email: "kofi@example.com", country: "Ghana" }]);
    const r = (await bulk(store, [
      { ...carmen, code: "new-code" },
      { name: "Mix", type: "agency", whatsapp: carmen.whatsapp, email: "kofi@example.com", country: "Ghana" },
    ])).body as Body;
    expect(r.results[0]).toMatchObject({ status: "error", code: "carmen-travels" });
    expect(r.results[0].error).toContain("cannot be changed");
    expect(r.results[1].status).toBe("error");
    expect(r.results[1].error).toContain("belongs to partner");
  });

  it("keeps a custom rule on update unless type or country changes", async () => {
    const { store, partners } = memoryStore();
    await bulk(store, [{ ...carmen, rule: { kind: "percent", value: 10 } }]);
    await bulk(store, [carmen]);
    expect(partners[0].commission_value).toBe(10);
    await bulk(store, [{ ...carmen, type: "local" }]);
    expect(partners[0]).toMatchObject({ partner_type: "local", commission_kind: "per_night", commission_value: 150 });
  });
});

describe("list partners", () => {
  it("returns links, contact fields and totals; setup link only while not set up", async () => {
    const { store, partners, bookings } = memoryStore();
    await bulk(store, [carmen, { name: "Kofi", type: "agency", email: "kofi@example.com", country: "Ghana" }]);
    partners[1].password_hash = "hash";
    const carmenId = partners[0].id;
    bookings.push(
      { influencer_id: carmenId, status: "paid", check_out: "2026-12-01", payout_status: "unpaid", commission_amount: 100 },
      { influencer_id: carmenId, status: "paid", check_out: "2026-11-01", payout_status: "unpaid", commission_amount: 50 },
      { influencer_id: carmenId, status: "paid", check_out: "2026-10-01", payout_status: "paid", commission_amount: 25 },
      { influencer_id: null, status: "paid", check_out: "2026-10-01", payout_status: "unpaid", commission_amount: 999 }
    );
    const r = await handleListPartners({ authHeader: AUTH, secret: SECRET, hotelSlug: "aracuya", store, now: NOW });
    const list = (r.body as { partners: Array<Record<string, unknown>> }).partners;
    expect(list[0]).toMatchObject({
      code: "carmen-travels",
      ref_link: "https://aracuya.com/?ref=carmen-travels",
      whatsapp: "+233241234567",
      email: "carmen@example.com",
      town: "Accra",
      type: "agency",
      currency: "GHS",
      set_up: false,
      totals: { pending: 100, owed: 50, paid: 25 },
    });
    expect(list[0].setup_link).toMatch(/token=/);
    expect(list[1]).toMatchObject({ code: "kofi", set_up: true, setup_link: null });

    const expired = await handleListPartners({
      authHeader: AUTH,
      secret: SECRET,
      hotelSlug: "aracuya",
      store,
      now: new Date(NOW.getTime() + 15 * 24 * 3600 * 1000),
    });
    expect((expired.body as { partners: Array<Record<string, unknown>> }).partners[0].setup_link).toBeNull();
  });
});
