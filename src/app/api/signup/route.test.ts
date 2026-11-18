import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { MemoryAttemptStore } from "@/lib/auth/rate-limit";
import { verifySession } from "@/lib/auth/session";
import { MemoryConfirmStore } from "@/lib/auth/email-confirm";

let columnsError: { code: string; message: string } | null = null;
let termsError: { code: string; message: string } | null = null;
const updates: { table: string; values: Record<string, unknown>; id: unknown }[] = [];
vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({ limit: async () => ({ error: columnsError }) }),
      update: (values: Record<string, unknown>) => ({
        eq: async (_col: string, id: unknown) => {
          updates.push({ table, values, id });
          return { error: termsError };
        },
      }),
    }),
  },
}));
const createHotel = vi.fn(async (h: Record<string, unknown>) => ({ id: "h9", ...h }));
const createAdminUser = vi.fn(async (u: Record<string, unknown>) => ({ id: "u9", role: "admin", ...u }));
vi.mock("@/lib/db", () => ({
  createHotel: (h: Record<string, unknown>) => createHotel(h),
  createAdminUser: (u: Record<string, unknown>) => createAdminUser(u),
  getAdminUserByEmail: async (e: string) => (e === "taken@inn.gh" ? { id: "x" } : null),
  getHotelBySlug: async (s: string) => (s === "busua-inn" ? { id: "old" } : null),
  seedDefaultNotificationPreferences: async () => {},
}));
vi.mock("@/lib/admin/auth", async (orig) => ({
  ...(await orig<typeof import("@/lib/admin/auth")>()),
  hashPassword: async () => "hash",
}));
let store = new MemoryAttemptStore();
vi.mock("@/lib/auth/rate-limit", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/rate-limit")>()),
  getAttemptStore: async () => store,
}));

const confirmStore = new MemoryConfirmStore();
vi.mock("@/lib/auth/email-confirm", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/email-confirm")>()),
  getConfirmStore: async () => confirmStore,
}));
const sendEmail = vi.fn<(m: { to: string; subject: string }) => Promise<{ success: boolean }>>(async () => ({ success: true }));
vi.mock("@/lib/notifications/email", () => ({ sendEmail: (m: { to: string; subject: string }) => sendEmail(m) }));

const { POST } = await import("./route");

const good = { hotelName: "Busua Inn", email: "Owner@Inn.gh", password: "longenough", acceptTerms: true };
function signup(body: object) {
  return POST(new NextRequest("http://localhost/api/signup", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "9.9.9.9" }, body: JSON.stringify(body) }));
}

describe("POST /api/signup (L2)", () => {
  beforeEach(() => {
    process.env.SIGNUP_OPEN = "true";
    columnsError = null;
    termsError = null;
    updates.length = 0;
    store = new MemoryAttemptStore();
    createHotel.mockClear();
    createAdminUser.mockClear();
    sendEmail.mockClear();
    confirmStore.rows = [];
  });

  it("L3: sends a confirm link to the login email; sign-up doesn't wait for it", async () => {
    const res = await signup(good);
    expect(res.status).toBe(200);
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "owner@inn.gh", subject: "Confirm your email for Abeiku" }));
    expect(confirmStore.rows).toEqual([expect.objectContaining({ admin_user_id: "u9", email: "owner@inn.gh", purpose: "verify" })]);
    const session = await verifySession<{ sv?: number }>(res.cookies.get("admin_session")?.value ?? "", "admin");
    expect(session?.sv).toBe(0);
  });

  it("L3: a failing confirm email never fails sign-up", async () => {
    sendEmail.mockResolvedValueOnce({ success: false });
    expect((await signup(good)).status).toBe(200);
  });

  it("closed unless SIGNUP_OPEN=true: 404, nothing created", async () => {
    delete process.env.SIGNUP_OPEN;
    expect((await signup(good)).status).toBe(404);
    process.env.SIGNUP_OPEN = "1";
    expect((await signup(good)).status).toBe(404);
    expect(createHotel).not.toHaveBeenCalled();
  });

  it("billing SQL not run: 503, nothing created", async () => {
    columnsError = { code: "42703", message: "column hotels.billing_status does not exist" };
    expect((await signup(good)).status).toBe(503);
    expect(createHotel).not.toHaveBeenCalled();
  });

  it("creates the hotel as pending_card and a session that is blocked until the card step", async () => {
    const res = await signup(good);
    expect(res.status).toBe(200);
    expect(createHotel).toHaveBeenCalledWith(expect.objectContaining({ name: "Busua Inn", slug: "busua-inn-1", billing_status: "pending_card", contact_email: "owner@inn.gh" }));
    const cookie = res.cookies.get("admin_session")?.value ?? "";
    const session = await verifySession<{ billing?: string; hotelId: string }>(cookie, "admin");
    expect(session).toMatchObject({ hotelId: "h9", billing: "blocked" });
  });

  it("existing email: 409", async () => {
    expect((await signup({ ...good, email: "taken@inn.gh" })).status).toBe(409);
  });

  it("bad input: 400", async () => {
    expect((await signup({ ...good, password: "short" })).status).toBe(400);
  });

  it("Terms box not ticked: 400 with a clear message, nothing created", async () => {
    for (const acceptTerms of [undefined, false, "true", "on", 1]) {
      const res = await signup({ ...good, acceptTerms });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("Tick the box to agree to the Terms and Privacy Policy.");
    }
    expect(createHotel).not.toHaveBeenCalled();
    expect(updates).toEqual([]);
  });

  it("saves when the Terms were accepted on the new hotel", async () => {
    const before = Date.now();
    expect((await signup(good)).status).toBe(200);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ table: "hotels", id: "h9" });
    const at = Date.parse(String(updates[0].values.terms_accepted_at));
    expect(at).toBeGreaterThanOrEqual(before);
    expect(at).toBeLessThanOrEqual(Date.now());
  });

  it("terms_accepted_at column not added yet: sign-up still succeeds", async () => {
    termsError = { code: "PGRST204", message: "Could not find the 'terms_accepted_at' column of 'hotels' in the schema cache" };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect((await signup(good)).status).toBe(200);
    expect(createAdminUser).toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("docs/go-live-terms.sql"));
    warn.mockRestore();
  });

  it("other error saving terms_accepted_at: logged, sign-up still succeeds", async () => {
    termsError = { code: "57014", message: "statement timeout" };
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await signup(good)).status).toBe(200);
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it("more than 5 sign-ups an hour from one address: 429", async () => {
    for (let i = 0; i < 5; i++) expect((await signup({ ...good, email: `o${i}@inn.gh` })).status).toBe(200);
    expect((await signup({ ...good, email: "o6@inn.gh" })).status).toBe(429);
  });
});
