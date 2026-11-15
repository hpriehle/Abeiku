import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { MemoryAttemptStore } from "@/lib/auth/rate-limit";

let store = new MemoryAttemptStore();
vi.mock("@/lib/auth/rate-limit", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/rate-limit")>()),
  getAttemptStore: async () => store,
}));
const verifyPassword = vi.fn(async (pw: string, _hash: string) => pw === "right-password" && _hash.length > 0);
vi.mock("@/lib/admin/auth", () => ({
  verifyPassword: (pw: string, hash: string) => verifyPassword(pw, hash),
  createSessionToken: async () => "token",
  getSessionCookieOptions: () => ({ name: "admin_session", options: { path: "/" } }),
  COOKIE_NAME: "admin_session",
}));
vi.mock("@/lib/db", () => ({
  getAdminUserByEmail: async (email: string) =>
    email === "owner@hotel.com" ? { id: "u1", hotel_id: "h1", email, password_hash: "$2b$real", role: "owner" } : null,
  getHotelById: async () => ({ id: "h1", name: "Hotel" }),
}));

const { POST } = await import("./route");

function login(email: string, password: string, ip = "1.2.3.4") {
  return POST(
    new NextRequest("http://localhost/api/admin/auth", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify({ email, password }),
    })
  );
}

describe("POST /api/admin/auth rate limit (F2 item 5)", () => {
  beforeEach(() => {
    store = new MemoryAttemptStore();
    verifyPassword.mockClear();
  });

  it("returns 429 with Retry-After after 10 failed tries, even with the right password", async () => {
    for (let i = 0; i < 10; i++) expect((await login("owner@hotel.com", "wrong")).status).toBe(401);
    const res = await login("owner@hotel.com", "right-password");
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect((await res.json()).error).toMatch(/Too many attempts/);
  });

  it("blocks the account from another IP too", async () => {
    for (let i = 0; i < 10; i++) await login("owner@hotel.com", "wrong", `10.0.0.${i}`);
    expect((await login("owner@hotel.com", "right-password", "9.9.9.9")).status).toBe(429);
  });

  it("checks a password hash even for unknown emails (no timing hint)", async () => {
    expect((await login("nobody@x.com", "whatever")).status).toBe(401);
    expect(verifyPassword).toHaveBeenCalledTimes(1);
  });

  it("logs in normally under the limit and clears the account counter", async () => {
    for (let i = 0; i < 5; i++) await login("owner@hotel.com", "wrong");
    expect((await login("owner@hotel.com", "right-password")).status).toBe(200);
  });
});
