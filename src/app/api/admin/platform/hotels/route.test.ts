import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let session: Record<string, unknown> | null = null;
let hotel: Record<string, unknown> | null = null;
let auditError: { message: string } | null = null;
const hotelUpdates: Record<string, unknown>[] = [];
const auditRows: Record<string, unknown>[] = [];
const tokens: Record<string, unknown>[] = [];
const extendTrial = vi.fn(async (_d: unknown, _id: string, days: number) => ({ trialEndsAt: `+${days}` }));

vi.mock("@/lib/admin/auth", () => ({
  getSession: async () => session,
  createSessionToken: async (p: Record<string, unknown>) => (tokens.push(p), "tok"),
  getSessionCookieOptions: () => ({ name: "admin_session", options: { path: "/" } }),
}));
vi.mock("@/lib/billing", () => ({ billingDeps: () => ({}) }));
vi.mock("@/lib/billing/flow", async (orig) => ({ ...(await orig<object>()), extendTrial }));
vi.mock("@/lib/billing/supabase-store", () => ({ supabaseBillingStore: { getHotel: async () => hotel } }));
vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    from: (table: string) =>
      table === "hotels"
        ? { update: (p: Record<string, unknown>) => ({ eq: async () => (hotelUpdates.push(p), { error: null }) }) }
        : { insert: async (row: Record<string, unknown>) => (auditRows.push(row), { error: auditError }) },
  },
}));

const { POST } = await import("./route");
const post = (body: unknown) =>
  POST(new NextRequest("http://localhost/api/admin/platform/hotels", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

const PLATFORM = { userId: "u1", email: "harrison@x", role: "platform_admin", hotelId: "home", hotelName: "Home Hotel", sv: 2 };

beforeEach(() => {
  session = PLATFORM;
  hotel = { id: "h2", name: "Palm Lodge", billing_status: "trialing", trial_ends_at: "2026-12-01T00:00:00.000Z" };
  auditError = null;
  hotelUpdates.length = 0;
  auditRows.length = 0;
  tokens.length = 0;
  extendTrial.mockClear();
});

describe("/api/admin/platform/hotels", () => {
  it("401 signed out, 403 for a normal hotel admin on every action, and nothing changes", async () => {
    session = null;
    expect((await post({ hotelId: "h2", action: "suspend" })).status).toBe(401);
    session = { ...PLATFORM, role: "admin" };
    for (const action of ["extend_trial", "set_exempt", "unset_exempt", "suspend", "unsuspend", "view_as", "view_back"]) {
      expect((await post({ hotelId: "h2", action, days: 7 })).status).toBe(403);
    }
    expect(hotelUpdates).toEqual([]);
    expect(auditRows).toEqual([]);
    expect(extendTrial).not.toHaveBeenCalled();
    expect(tokens).toEqual([]);
  });

  it("rejects an unknown action, a missing hotel and odd trial days", async () => {
    expect((await post({ hotelId: "h2", action: "delete" })).status).toBe(400);
    expect((await post({ action: "suspend" })).status).toBe(400);
    expect((await post({ hotelId: "h2", action: "extend_trial", days: 5 })).status).toBe(400);
    hotel = null;
    expect((await post({ hotelId: "nope", action: "suspend" })).status).toBe(404);
    expect(extendTrial).not.toHaveBeenCalled();
  });

  it("extends the trial and writes who, what and which hotel", async () => {
    const res = await post({ hotelId: "h2", action: "extend_trial", days: 14 });
    expect(await res.json()).toEqual({ ok: true, audited: true });
    expect(extendTrial).toHaveBeenCalledWith({}, "h2", 14);
    expect(auditRows).toEqual([
      { actor_id: "u1", actor_email: "harrison@x", hotel_id: "h2", action: "extend_trial", detail: "+14 days, trial ends +14 (was 2026-12-01T00:00:00.000Z)" },
    ]);
  });

  it("suspend sets suspended_at, unsuspend clears it", async () => {
    await post({ hotelId: "h2", action: "suspend" });
    await post({ hotelId: "h2", action: "unsuspend" });
    expect(typeof hotelUpdates[0].suspended_at).toBe("string");
    expect(hotelUpdates[1]).toEqual({ suspended_at: null });
    expect(auditRows.map((r) => r.action)).toEqual(["suspend", "unsuspend"]);
  });

  it("refuses exempt while a subscription can still charge; allows it otherwise", async () => {
    hotel = { ...hotel, billing_subscription_id: "sub_1" };
    expect((await post({ hotelId: "h2", action: "set_exempt" })).status).toBe(409);
    expect(hotelUpdates).toEqual([]);
    hotel = { ...hotel, billing_status: "canceled" };
    expect((await post({ hotelId: "h2", action: "set_exempt" })).status).toBe(200);
    await post({ hotelId: "h2", action: "unset_exempt" });
    expect(hotelUpdates).toEqual([{ billing_exempt: true }, { billing_exempt: false }]);
  });

  it("says when the audit row could not be written", async () => {
    auditError = { message: "relation platform_actions does not exist" };
    expect(await (await post({ hotelId: "h2", action: "unsuspend" })).json()).toEqual({ ok: true, audited: false });
  });

  it("view as: same login on the hotel, remembers home; view_back returns", async () => {
    const res = await post({ hotelId: "h2", action: "view_as" });
    expect(res.status).toBe(200);
    expect(res.cookies.get("admin_session")?.value).toBe("tok");
    expect(tokens[0]).toEqual({ userId: "u1", email: "harrison@x", role: "platform_admin", sv: 2, hotelId: "h2", hotelName: "Palm Lodge", homeHotelId: "home", homeHotelName: "Home Hotel" });

    session = { ...PLATFORM, hotelId: "h2", hotelName: "Palm Lodge", homeHotelId: "home", homeHotelName: "Home Hotel" };
    hotel = { id: "home", name: "Home Hotel" };
    expect((await post({ action: "view_back" })).status).toBe(200);
    expect(tokens[1]).toEqual({ userId: "u1", email: "harrison@x", role: "platform_admin", sv: 2, hotelId: "home", hotelName: "Home Hotel" });
    expect(auditRows.map((r) => [r.action, r.hotel_id])).toEqual([["view_as", "h2"], ["view_back", "home"]]);
  });

  it("does not switch when the audit row fails", async () => {
    auditError = { message: "nope" };
    const res = await post({ hotelId: "h2", action: "view_as" });
    expect(res.status).toBe(503);
    expect(res.cookies.get("admin_session")).toBeUndefined();
  });
});
