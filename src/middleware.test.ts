import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { signSession } from "@/lib/auth/session";
import { middleware } from "./middleware";

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
  it("a partner session does not open /admin", async () => {
    const cookie = `admin_session=${await signSession("partner", { influencerId: "p1" })}`;
    const res = await middleware(new NextRequest("http://localhost/admin/dashboard", { headers: { cookie } }));
    expect(res.headers.get("location")).toBe("http://localhost/admin/login");
  });
});
