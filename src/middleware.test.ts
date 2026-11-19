import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { signSession } from "@/lib/auth/session";
import { billingView, type HotelBilling } from "@/lib/billing/access";
import { middleware } from "./middleware";

const day = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * day).toISOString();
// Billing rows by hotel id; a missing id is a hotel with no billing record.
const hotels: Record<string, HotelBilling> = {
  locked: { billing_status: "past_due", past_due_since: ago(15) },
  grace: { billing_status: "past_due", past_due_since: ago(13) },
  exempt: { billing_status: "past_due", past_due_since: ago(30), billing_exempt: true },
};
vi.mock("@/lib/billing", () => ({ loadBillingView: async (id: string) => billingView(hotels[id] ?? {}) }));

const base = { userId: "u1", hotelId: "h1", email: "a@b.c", hotelName: "H", role: "admin" };

async function hit(path: string, claims?: object) {
  const headers: Record<string, string> = {};
  if (claims) headers.cookie = `admin_session=${await signSession("admin", claims)}`;
  return middleware(new NextRequest(`http://localhost${path}`, { headers }));
}

describe("middleware: billing gate (L2)", () => {
  it("normal admin session: /admin and /api/admin open", async () => {
    expect((await hit("/admin/dashboard", base)).headers.get("location")).toBeNull();
    expect((await hit("/api/admin/bookings", base)).status).toBe(200);
  });
  it("signed up without a card: /admin goes to /signup", async () => {
    const res = await hit("/admin/dashboard", { ...base, billing: "blocked" });
    expect(res.headers.get("location")).toBe("http://localhost/signup");
  });
  it("signed up without a card: admin API answers 402, logout still works", async () => {
    const res = await hit("/api/admin/rooms", { ...base, billing: "blocked" });
    expect(res.status).toBe(402);
    expect((await hit("/api/admin/auth/logout", { ...base, billing: "blocked" })).status).toBe(200);
  });
  it("no session: /admin goes to login, /api/admin left to the route (401 there)", async () => {
    expect((await hit("/admin/dashboard")).headers.get("location")).toBe("http://localhost/admin/login");
    expect((await hit("/api/admin/rooms")).status).toBe(200);
  });
  it("no session: login, forgot-password and reset-password pages stay open", async () => {
    for (const p of ["/admin/login", "/admin/forgot-password", "/admin/reset-password"]) {
      expect((await hit(p)).headers.get("location")).toBeNull();
    }
    expect((await hit("/admin/reset-password-x")).headers.get("location")).toBe("http://localhost/admin/login");
  });
  it("signed up without a card: forgot/reset password API still answers", async () => {
    expect((await hit("/api/admin/auth/forgot", { ...base, billing: "blocked" })).status).toBe(200);
    expect((await hit("/api/admin/auth/reset", { ...base, billing: "blocked" })).status).toBe(200);
  });
  it("a partner session does not open /admin", async () => {
    const cookie = `admin_session=${await signSession("partner", { influencerId: "p1" })}`;
    const res = await middleware(new NextRequest("http://localhost/admin/dashboard", { headers: { cookie } }));
    expect(res.headers.get("location")).toBe("http://localhost/admin/login");
  });
});

describe("middleware: admin API locked after 14 days past due (L3)", () => {
  const locked = { ...base, hotelId: "locked" };

  it("locked hotel: admin API that reads or changes hotel data answers 402 billing_locked", async () => {
    for (const p of ["/api/admin/rooms", "/api/admin/bookings", "/api/admin/hotel", "/api/admin/account/email", "/api/admin/billingx"]) {
      const res = await hit(p, locked);
      expect(res.status, p).toBe(402);
      expect(await res.json()).toEqual({ error: "billing_locked" });
    }
  });
  it("locked hotel: auth, password and billing API stay open", async () => {
    for (const p of [
      "/api/admin/auth",
      "/api/admin/auth/logout",
      "/api/admin/auth/forgot",
      "/api/admin/auth/reset",
      "/api/admin/account/password",
      "/api/admin/billing/card",
      "/api/admin/billing/cancel",
      "/api/admin/billing/rooms",
    ]) {
      expect((await hit(p, locked)).status, p).toBe(200);
    }
  });
  it("platform admin of a locked hotel is not blocked", async () => {
    expect((await hit("/api/admin/rooms", { ...locked, role: "platform_admin" })).status).toBe(200);
  });
  it("exempt hotel, hotel with no billing record, and hotel within the grace period are not blocked", async () => {
    for (const hotelId of ["exempt", "no-record", "grace"]) {
      expect((await hit("/api/admin/rooms", { ...base, hotelId })).status, hotelId).toBe(200);
    }
  });
  it("locked hotel pages are left to the admin layout (no 402 on /admin)", async () => {
    expect((await hit("/admin/dashboard", locked)).status).toBe(200);
  });
});
