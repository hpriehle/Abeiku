import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { MemoryAttemptStore } from "@/lib/auth/rate-limit";
import { MemoryResetStore, SENT_MESSAGE, hashToken } from "@/lib/auth/password-reset";

let attempts = new MemoryAttemptStore();
let resets = new MemoryResetStore();
vi.mock("@/lib/auth/rate-limit", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/rate-limit")>()),
  getAttemptStore: async () => attempts,
}));
vi.mock("@/lib/auth/password-reset", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/password-reset")>()),
  getResetStore: async () => resets,
}));
vi.mock("@/lib/db", () => ({
  getAdminUserByEmail: async (email: string) =>
    email === "owner@hotel.com" ? { id: "u1", hotel_id: "h1", email: "owner@hotel.com", role: "owner" } : null,
}));
const sendEmail = vi.fn(async (m: { to: string; subject: string; html: string; text?: string }) => ({ success: !!m }));
vi.mock("@/lib/notifications/email", () => ({ sendEmail: (m: never) => sendEmail(m) }));

const { POST } = await import("./route");

function ask(email: unknown, ip = "1.2.3.4") {
  return POST(
    new NextRequest("http://localhost/api/admin/auth/forgot", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify({ email }),
    })
  );
}

describe("POST /api/admin/auth/forgot", () => {
  beforeEach(() => {
    attempts = new MemoryAttemptStore();
    resets = new MemoryResetStore();
    sendEmail.mockClear();
    process.env.NEXT_PUBLIC_APP_URL = "https://abeiku.com";
  });

  it("known email: stores a token hash and emails a one-time link", async () => {
    const res = await ask("  Owner@Hotel.com ");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, message: SENT_MESSAGE });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const mail = sendEmail.mock.calls[0][0];
    expect(mail.to).toBe("owner@hotel.com");
    const token = /reset-password\?token=([A-Za-z0-9_-]+)/.exec(mail.text ?? "")?.[1];
    expect(token).toBeTruthy();
    expect(resets.rows).toHaveLength(1);
    expect(resets.rows[0]).toMatchObject({ admin_user_id: "u1", token_hash: hashToken(token!) });
  });

  it("unknown email: same answer, no email, no token", async () => {
    const res = await ask("nobody@x.com");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, message: SENT_MESSAGE });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(resets.rows).toHaveLength(0);
  });

  it("same answer when the token table is missing (logged, not shown)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    resets.insert = async () => {
      throw new Error('relation "password_resets" does not exist');
    };
    const res = await ask("owner@hotel.com");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, message: SENT_MESSAGE });
    expect(sendEmail).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("missing or bad email: 400", async () => {
    expect((await ask("")).status).toBe(400);
    expect((await ask(42)).status).toBe(400);
    expect((await ask("not-an-email")).status).toBe(400);
  });

  it("per email: 3 per hour, from any IP, and unknown emails are limited the same way", async () => {
    for (let i = 0; i < 3; i++) expect((await ask("owner@hotel.com", `10.0.0.${i}`)).status).toBe(200);
    const res = await ask("owner@hotel.com", "9.9.9.9");
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(sendEmail).toHaveBeenCalledTimes(3);

    for (let i = 0; i < 3; i++) await ask("nobody@x.com", `10.0.1.${i}`);
    expect((await ask("nobody@x.com", "9.9.9.8")).status).toBe(429);
  });

  it("per IP: 10 per 15 minutes across different emails", async () => {
    for (let i = 0; i < 10; i++) expect((await ask(`guess${i}@x.com`)).status).toBe(200);
    expect((await ask("owner@hotel.com")).status).toBe(429);
    expect(sendEmail).not.toHaveBeenCalled();
    expect((await ask("owner@hotel.com", "5.5.5.5")).status).toBe(200);
  });

  it("does not touch the login lock keys", async () => {
    await ask("owner@hotel.com");
    expect(await attempts.recent("admin:ip:1.2.3.4", 0)).toHaveLength(0);
  });
});
