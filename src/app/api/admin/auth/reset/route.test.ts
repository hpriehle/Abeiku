import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { MemoryAttemptStore, loginKeys, recordFailure } from "@/lib/auth/rate-limit";
import { MemoryResetStore, createResetToken, RESET_TOKEN_TTL_MS } from "@/lib/auth/password-reset";

let attempts = new MemoryAttemptStore();
let resets = new MemoryResetStore();
const passwords = new Map<string, string>();
vi.mock("@/lib/auth/rate-limit", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/rate-limit")>()),
  getAttemptStore: async () => attempts,
}));
vi.mock("@/lib/auth/password-reset", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/password-reset")>()),
  getResetStore: async () => resets,
}));
const hashPassword = vi.fn(async (pw: string) => `hashed:${pw}`);
vi.mock("@/lib/admin/auth", () => ({ hashPassword: (pw: string) => hashPassword(pw) }));
vi.mock("@/lib/db", () => ({
  getAdminUserById: async (id: string) => (id === "u1" ? { id: "u1", email: "owner@hotel.com" } : null),
  setAdminUserPassword: async (id: string, hash: string) => {
    passwords.set(id, hash);
  },
}));
const sendEmail = vi.fn(async (m: { to: string; subject: string; html: string; text?: string }) => ({ success: !!m }));
vi.mock("@/lib/notifications/email", () => ({ sendEmail: (m: never) => sendEmail(m) }));

const { POST } = await import("./route");

function reset(token: unknown, password: unknown) {
  return POST(
    new NextRequest("http://localhost/api/admin/auth/reset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, password }),
    })
  );
}

describe("POST /api/admin/auth/reset", () => {
  beforeEach(() => {
    attempts = new MemoryAttemptStore();
    resets = new MemoryResetStore();
    passwords.clear();
    sendEmail.mockClear();
    hashPassword.mockClear();
  });

  it("sets the new password (bcrypt helper), uses the token, emails a 'password changed' note", async () => {
    const token = await createResetToken(resets, "u1");
    const res = await reset(token, "new-secret-1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(passwords.get("u1")).toBe("hashed:new-secret-1");
    expect(resets.rows[0].used_at).not.toBeNull();
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0].to).toBe("owner@hotel.com");
    expect(sendEmail.mock.calls[0][0].text).toContain("If this wasn't you, reply to hello@abeiku.com");
  });

  it("clears the account's login lock but not the IP counter", async () => {
    const [ipKey, acctKey] = loginKeys("admin", "1.2.3.4", "owner@hotel.com");
    for (let i = 0; i < 10; i++) await recordFailure(attempts, [ipKey, acctKey]);
    const token = await createResetToken(resets, "u1");
    expect((await reset(token, "new-secret-1")).status).toBe(200);
    expect(await attempts.recent(acctKey, 0)).toHaveLength(0);
    expect(await attempts.recent(ipKey, 0)).toHaveLength(10);
  });

  it("a used link can't be used again", async () => {
    const token = await createResetToken(resets, "u1");
    expect((await reset(token, "new-secret-1")).status).toBe(200);
    const again = await reset(token, "evil-pass-2");
    expect(again.status).toBe(400);
    expect(await again.json()).toMatchObject({ linkProblem: "used" });
    expect(passwords.get("u1")).toBe("hashed:new-secret-1");
  });

  it("using one link closes the user's older links", async () => {
    const older = await createResetToken(resets, "u1");
    const newer = await createResetToken(resets, "u1");
    expect((await reset(newer, "new-secret-1")).status).toBe(200);
    expect((await reset(older, "new-secret-2")).status).toBe(400);
  });

  it("an expired link is refused and the password stays", async () => {
    const token = await createResetToken(resets, "u1", Date.now() - RESET_TOKEN_TTL_MS - 1);
    const res = await reset(token, "new-secret-1");
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ linkProblem: "expired", error: expect.stringMatching(/expired/) });
    expect(passwords.size).toBe(0);
    expect(hashPassword).not.toHaveBeenCalled();
  });

  it("an unknown or missing token is refused", async () => {
    expect(await (await reset("A".repeat(43), "new-secret-1")).json()).toMatchObject({ linkProblem: "invalid" });
    expect((await reset(undefined, "new-secret-1")).status).toBe(400);
    expect(passwords.size).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("a short password is refused and the link stays usable", async () => {
    const token = await createResetToken(resets, "u1");
    const res = await reset(token, "short");
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/at least 8/);
    expect(resets.rows[0].used_at).toBeNull();
    expect((await reset(token, "long-enough")).status).toBe(200);
  });
});
