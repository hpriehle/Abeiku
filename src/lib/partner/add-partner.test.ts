import { describe, expect, it, vi } from "vitest";
import type { Influencer } from "@/lib/db/influencers";
import { handleAddPartner, type AddPartnerDeps, type AddPartnerInput } from "./add-partner";
import { membership, memoryAccountStore } from "./accounts-memory.test-helper";

const AMA = { id: "acc-ama", email: "ama@x.com", whatsapp: "+233241111111", name: "Ama Mensah", password_hash: "hash:pw" };
const HOTEL = { id: "hotel-b", name: "Other Lodge" };

function input(over: Partial<AddPartnerInput> = {}): AddPartnerInput {
  return {
    name: "Ama",
    email: null,
    whatsapp: null,
    town: null,
    partner_type: "agency",
    country: "Ghana",
    code: "",
    commission_kind: "percent",
    commission_value: 10,
    ...over,
  };
}

function setup(opts: Parameters<typeof memoryAccountStore>[0] = {}, siteUrl: string | null = "https://other.example") {
  const mem = memoryAccountStore(opts);
  const sendEmail = vi.fn(async () => ({ success: true }));
  let n = 0;
  const deps: AddPartnerDeps = {
    store: mem.store,
    hotel: HOTEL,
    siteUrl,
    getBySlug: async (h, c) => mem.rows.find((r) => r.hotel_id === h && r.slug === c) ?? null,
    getByEmail: async (e) => mem.rows.find((r) => r.email === e) ?? null,
    getByWhatsapp: async (h, w) => mem.rows.find((r) => r.hotel_id === h && r.whatsapp === w) ?? null,
    listCodes: async (h) => mem.rows.filter((r) => r.hotel_id === h).map((r) => r.slug),
    create: async (row) => {
      const m: Influencer = membership({ ...row, id: `new${++n}`, account_id: row.account_id ?? null, password_hash: row.password_hash ?? null });
      mem.rows.push(m);
      return m;
    },
    sendEmail,
    newToken: () => `tok${n + 1}`,
  };
  return { ...mem, deps, sendEmail };
}

const amaAtAracuya = membership({ id: "m-a", hotel_id: "hotel-a", slug: "ama", email: "ama@x.com", whatsapp: AMA.whatsapp, account_id: AMA.id, password_hash: AMA.password_hash });

describe("hotel adds a partner who already has an account", () => {
  it("by email: membership right away (no setup link), partner emailed, WhatsApp tap link for the hotel", async () => {
    const t = setup({ accounts: [{ ...AMA }], memberships: [amaAtAracuya] });
    const r = await handleAddPartner(input({ email: "AMA@x.com".toLowerCase(), name: "Ama" }), t.deps);
    expect(r.status).toBe(201);
    const body = r.body as Record<string, unknown>;
    expect(body).toMatchObject({ existing_account: true, setup_url: null, emailed: true });
    const created = t.rows.find((m) => m.hotel_id === HOTEL.id)!;
    expect(created).toMatchObject({ account_id: AMA.id, invite_token: null, password_hash: AMA.password_hash, slug: "ama", commission_value: 10 });
    // Aracuya's membership is untouched.
    expect(t.rows.find((m) => m.id === "m-a")).toMatchObject({ slug: "ama", hotel_id: "hotel-a" });

    expect(t.sendEmail).toHaveBeenCalledTimes(1);
    const mail = (t.sendEmail.mock.calls[0] as unknown as [{ to: string; subject: string; text: string }])[0];
    expect(mail.to).toBe("ama@x.com");
    expect(mail.subject).toContain("Other Lodge");
    expect(mail.text).toContain("https://other.example/?ref=ama");

    const wa = String(body.whatsapp_url);
    expect(wa.startsWith("https://wa.me/233241111111?text=")).toBe(true);
    expect(decodeURIComponent(wa.split("text=")[1])).toContain("https://other.example/?ref=ama");
  });

  it("by WhatsApp only: same, the account is found by its number", async () => {
    const t = setup({ accounts: [{ ...AMA }], memberships: [amaAtAracuya] });
    const r = await handleAddPartner(input({ whatsapp: AMA.whatsapp }), t.deps);
    expect(r.status).toBe(201);
    expect(t.rows.find((m) => m.hotel_id === HOTEL.id)?.account_id).toBe(AMA.id);
  });

  it("already this hotel's partner: 409, nothing created, nobody emailed", async () => {
    const t = setup({ accounts: [{ ...AMA }], memberships: [{ ...amaAtAracuya, id: "m-b", hotel_id: HOTEL.id }] });
    const r = await handleAddPartner(input({ email: "ama@x.com" }), t.deps);
    expect(r.status).toBe(409);
    expect(t.rows).toHaveLength(1);
    expect(t.sendEmail).not.toHaveBeenCalled();
  });

  it("a failed email still adds the partner and says it was not emailed", async () => {
    const t = setup({ accounts: [{ ...AMA }], memberships: [amaAtAracuya] });
    t.sendEmail.mockResolvedValueOnce({ success: false });
    const r = await handleAddPartner(input({ email: "ama@x.com" }), t.deps);
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ emailed: false });
  });

  it("account never set up (no password): membership linked, but with a setup link and no email", async () => {
    const t = setup({ accounts: [{ ...AMA, password_hash: null }], memberships: [{ ...amaAtAracuya, password_hash: null }] });
    const r = await handleAddPartner(input({ email: "ama@x.com" }), t.deps);
    expect(r.body).toMatchObject({ existing_account: true, setup_url: expect.stringContaining("/partner/setup?token=") });
    expect(t.rows.find((m) => m.hotel_id === HOTEL.id)?.account_id).toBe(AMA.id);
    expect(t.sendEmail).not.toHaveBeenCalled();
  });
});

describe("hotel adds a new partner", () => {
  it("no account: setup link as before P2, no account made yet, no email", async () => {
    const t = setup();
    const r = await handleAddPartner(input({ name: "Kofi Tours", email: "kofi@x.com" }), t.deps);
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({
      existing_account: false,
      setup_url: expect.stringContaining("/partner/setup?token=tok1"),
      setup_expires_at: null,
      partner: { code: "kofi-tours" },
    });
    expect(t.rows[0]).toMatchObject({ invite_token: "tok1", account_id: null });
    expect(t.accounts).toHaveLength(0);
    expect(t.sendEmail).not.toHaveBeenCalled();
  });

  it("before the SQL: email used at another hotel is refused as before", async () => {
    const t = setup({ ready: false, memberships: [membership({ id: "m-a", hotel_id: "hotel-a", email: "ama@x.com" })] });
    const r = await handleAddPartner(input({ email: "ama@x.com" }), t.deps);
    expect(r).toEqual({ status: 409, body: { error: "Email already registered" } });
  });

  it("code and WhatsApp clashes in the hotel are refused as before", async () => {
    const t = setup({ memberships: [membership({ id: "m1", hotel_id: HOTEL.id, slug: "taken", whatsapp: "+233249999999", account_id: null })] });
    expect((await handleAddPartner(input({ email: "x@x.com", code: "taken" }), t.deps)).status).toBe(409);
    expect((await handleAddPartner(input({ whatsapp: "+233249999999" }), t.deps)).status).toBe(409);
  });
});
