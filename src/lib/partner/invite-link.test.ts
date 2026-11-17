import { describe, expect, it } from "vitest";
import { handleInviteLink } from "./invite-link";
import type { PartnerAdminStore, PartnerRecord } from "./bulk";

const KEY = "test-partner-key";
const AUTH = `Bearer ${KEY}`;
const NOW = new Date("2026-11-17T12:00:00Z");

function partner(over: Partial<PartnerRecord>): PartnerRecord {
  return {
    id: "p0",
    hotel_id: "hotel-1",
    slug: "kofi",
    name: "Kofi",
    email: null,
    whatsapp: null,
    town: null,
    ghl_contact_id: null,
    partner_type: "agency",
    country: "Ghana",
    currency: "GHS",
    commission_kind: "percent",
    commission_value: 15,
    commission_currency: "GHS",
    password_hash: null,
    invite_token: null,
    invite_expires_at: null,
    ...over,
  };
}

function memoryStore(initial: PartnerRecord[] = []) {
  const partners = initial.map((p) => ({ ...p }));
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
      if (email === "taken@elsewhere.com") return { id: "other", hotel_id: "hotel-2" };
      const p = partners.find((x) => x.email === email);
      return p ? { id: p.id, hotel_id: p.hotel_id } : null;
    },
    async insertPartner(row) {
      calls.insert++;
      const p: PartnerRecord = { ...row, id: `new${++seq}`, password_hash: null };
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
      return [];
    },
  };
  return { store, partners, calls };
}

let tokenSeq = 0;
const newToken = () => `tok${++tokenSeq}`;

function call(store: PartnerAdminStore, body: unknown, opts: { auth?: string | null; secret?: string; now?: Date } = {}) {
  return handleInviteLink({
    authHeader: opts.auth === undefined ? AUTH : opts.auth,
    secret: "secret" in opts ? opts.secret : KEY,
    body,
    store,
    now: opts.now ?? NOW,
    newToken,
  });
}

type Res = Record<string, unknown> & { url: string; partnerId: string; status: string };

describe("POST /api/partners/invite-link: auth", () => {
  it("refuses everything when the key is not configured", async () => {
    const { store, calls } = memoryStore();
    const r = await call(store, { hotel: "aracuya", name: "A", email: "a@x.com" }, { secret: undefined });
    expect(r.status).toBe(503);
    expect((await call(store, {}, { secret: "" })).status).toBe(503);
    expect(calls.insert).toBe(0);
  });

  it("401 on missing or wrong key", async () => {
    const { store, calls } = memoryStore();
    const body = { hotel: "aracuya", name: "A", email: "a@x.com" };
    expect((await call(store, body, { auth: null })).status).toBe(401);
    expect((await call(store, body, { auth: "Bearer nope" })).status).toBe(401);
    expect((await call(store, body, { auth: KEY })).status).toBe(401);
    expect(calls.insert).toBe(0);
  });
});

describe("POST /api/partners/invite-link: validation", () => {
  it("400 on bad body, 404 on unknown hotel", async () => {
    const { store } = memoryStore();
    expect((await call(store, null)).status).toBe(400);
    expect((await call(store, { name: "A", email: "a@x.com" })).status).toBe(400);
    expect((await call(store, { hotel: "aracuya", email: "a@x.com" })).status).toBe(400);
    const neither = await call(store, { hotel: "aracuya", name: "A" });
    expect(neither).toMatchObject({ status: 400, body: { error: expect.stringMatching(/whatsapp or email/) } });
    expect((await call(store, { hotel: "aracuya", name: "A", whatsapp: "12" })).status).toBe(400);
    expect((await call(store, { hotel: "nowhere", name: "A", email: "a@x.com" })).status).toBe(404);
  });
});

describe("POST /api/partners/invite-link: matching", () => {
  const ama = partner({ id: "ama", slug: "ama", name: "Ama", whatsapp: "+233241234567", email: "ama@x.com", invite_token: "amatok" });
  const yaw = partner({ id: "yaw", slug: "yaw", name: "Yaw", whatsapp: "+233209999999", email: "yaw@x.com", invite_token: "yawtok" });

  it("matches by normalized WhatsApp", async () => {
    const { store, calls } = memoryStore([ama]);
    const r = await call(store, { hotel: "aracuya", name: "Whatever", whatsapp: "00233 24 123 4567" });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ partnerId: "ama", status: "setup", created: false, url: expect.stringContaining("token=amatok") });
    expect(calls.insert + calls.update).toBe(0);
  });

  it("then by lowercased email", async () => {
    const { store } = memoryStore([ama]);
    const r = await call(store, { hotel: "aracuya", name: "Ama", whatsapp: "+233200000001", email: " AMA@X.com " });
    expect(r.body).toMatchObject({ partnerId: "ama", status: "setup" });
  });

  it("WhatsApp wins over email when they point at different partners", async () => {
    const { store } = memoryStore([ama, yaw]);
    const r = await call(store, { hotel: "aracuya", name: "Ama", whatsapp: "+233241234567", email: "yaw@x.com" });
    expect(r.body).toMatchObject({ partnerId: "ama" });
  });

  it("only matches within the hotel", async () => {
    const { store, calls } = memoryStore([{ ...ama, hotel_id: "hotel-2", email: null }]);
    const r = await call(store, { hotel: "aracuya", name: "Ama", whatsapp: "+233241234567" });
    expect(r.status).toBe(201);
    expect(calls.insert).toBe(1);
  });
});

describe("POST /api/partners/invite-link: links", () => {
  it("creates a partner with the local default and a link that never expires", async () => {
    const { store, partners } = memoryStore();
    const r = await call(store, { hotel: "aracuya", name: "Esi's Shop", whatsapp: "+233 24 555 0000" });
    expect(r.status).toBe(201);
    const body = r.body as Res;
    expect(body).toMatchObject({
      status: "setup",
      created: true,
      code: "esi-shop",
      partnerLink: "https://aracuya.com/?ref=esi-shop",
      type: "local",
      commission: { kind: "per_night", value: 150, currency: "GHS" },
    });
    expect(body.url).toMatch(/\/partner\/setup\?token=tok\d+$/);
    expect(partners[0]).toMatchObject({ whatsapp: "+233245550000", invite_expires_at: null, country: "Ghana" });
  });

  it("accepts type, country and rule overrides", async () => {
    const { store } = memoryStore();
    const r = await call(store, {
      hotel: "aracuya",
      name: "Lagos Tours",
      email: "lt@x.com",
      type: "influencer",
      country: "Nigeria",
      rule: { kind: "percent", value: 10 },
    });
    expect(r.body).toMatchObject({ type: "influencer", commission: { kind: "percent", value: 10, currency: "USD" } });
    const noRule = await call(store, { hotel: "aracuya", name: "Influ", email: "in@x.com", type: "influencer" });
    expect(noRule.status).toBe(400);
  });

  it("409 when the email belongs to another hotel's partner", async () => {
    const { store } = memoryStore();
    const r = await call(store, { hotel: "aracuya", name: "A", email: "taken@elsewhere.com" });
    expect(r.status).toBe(409);
  });

  it("reuses the same token on repeat calls, even a year later", async () => {
    const { store, partners, calls } = memoryStore();
    const first = (await call(store, { hotel: "aracuya", name: "Kwame", email: "kwame@x.com" })).body as Res;
    const later = new Date(NOW.getTime() + 365 * 24 * 3600 * 1000);
    const second = await call(store, { hotel: "aracuya", name: "Kwame", email: "kwame@x.com" }, { now: later });
    expect(second.status).toBe(200);
    expect((second.body as Res).url).toBe(first.url);
    expect((second.body as Res).partnerId).toBe(first.partnerId);
    expect(partners).toHaveLength(1);
    expect(calls.update).toBe(0);
  });

  it("replaces an expired or missing token with one that never expires", async () => {
    const old = partner({ id: "old", email: "old@x.com", invite_token: "oldtok", invite_expires_at: "2026-11-01T00:00:00Z" });
    const none = partner({ id: "none", slug: "none", email: "none@x.com" });
    const { store, partners } = memoryStore([old, none]);
    const a = (await call(store, { hotel: "aracuya", name: "Old", email: "old@x.com" })).body as Res;
    expect(a.url).not.toContain("oldtok");
    expect(partners[0]).toMatchObject({ invite_expires_at: null });
    expect(a.url).toContain(`token=${partners[0].invite_token}`);
    const b = (await call(store, { hotel: "aracuya", name: "None", email: "none@x.com" })).body as Res;
    expect(b.url).toContain(`token=${partners[1].invite_token}`);
  });

  it("keeps a still-valid dated token from before the change", async () => {
    const dated = partner({ id: "d", email: "d@x.com", invite_token: "datedtok", invite_expires_at: "2026-11-28T00:00:00Z" });
    const { store, calls } = memoryStore([dated]);
    const r = (await call(store, { hotel: "aracuya", name: "D", email: "d@x.com" })).body as Res;
    expect(r.url).toContain("token=datedtok");
    expect(calls.update).toBe(0);
  });

  it("already active: login URL, no new token", async () => {
    const done = partner({ id: "done", email: "done@x.com", password_hash: "$2b$hash" });
    const { store, partners, calls } = memoryStore([done]);
    const r = await call(store, { hotel: "aracuya", name: "Done", email: "done@x.com" });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ partnerId: "done", status: "active", created: false });
    expect((r.body as Res).url).toMatch(/\/partner\/login$/);
    expect(partners[0].invite_token).toBeNull();
    expect(calls.update).toBe(0);
  });
});
