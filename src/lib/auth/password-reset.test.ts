import { describe, it, expect } from "vitest";
import {
  MemoryResetStore,
  SupabaseResetStore,
  createResetToken,
  checkResetToken,
  consumeResetToken,
  hashToken,
  passwordProblem,
  RESET_TOKEN_TTL_MS,
} from "./password-reset";
import { passwordChangedEmail, resetRequestEmail } from "./password-reset-emails";

const T0 = Date.UTC(2026, 10, 16, 12, 0, 0);

describe("reset tokens", () => {
  it("creates a 32-byte random token and stores only its sha256 hash, valid 1 hour", async () => {
    const store = new MemoryResetStore();
    const token = await createResetToken(store, "u1", T0);
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
    expect(store.rows).toHaveLength(1);
    const row = store.rows[0];
    expect(row.token_hash).toBe(hashToken(token));
    expect(row.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(row)).not.toContain(token);
    expect(new Date(row.expires_at).getTime()).toBe(T0 + RESET_TOKEN_TTL_MS);
    expect(await createResetToken(store, "u1", T0)).not.toBe(token);
  });

  it("verifies a fresh token and returns the user", async () => {
    const store = new MemoryResetStore();
    const token = await createResetToken(store, "u1", T0);
    expect(await checkResetToken(store, token, T0 + 1000)).toMatchObject({ ok: true });
    expect(await consumeResetToken(store, token, T0 + 1000)).toEqual({ ok: true, adminUserId: "u1" });
  });

  it("rejects unknown and malformed tokens", async () => {
    const store = new MemoryResetStore();
    await createResetToken(store, "u1", T0);
    expect(await consumeResetToken(store, "x".repeat(43), T0)).toEqual({ ok: false, problem: "invalid" });
    expect(await consumeResetToken(store, "", T0)).toEqual({ ok: false, problem: "invalid" });
    expect(await consumeResetToken(store, undefined as unknown as string, T0)).toEqual({ ok: false, problem: "invalid" });
  });

  it("expires after 1 hour", async () => {
    const store = new MemoryResetStore();
    const token = await createResetToken(store, "u1", T0);
    expect((await checkResetToken(store, token, T0 + RESET_TOKEN_TTL_MS - 1)).ok).toBe(true);
    expect(await consumeResetToken(store, token, T0 + RESET_TOKEN_TTL_MS)).toEqual({ ok: false, problem: "expired" });
    expect(store.rows[0].used_at).toBeNull();
  });

  it("works only once", async () => {
    const store = new MemoryResetStore();
    const token = await createResetToken(store, "u1", T0);
    expect((await consumeResetToken(store, token, T0)).ok).toBe(true);
    expect(await consumeResetToken(store, token, T0 + 1)).toEqual({ ok: false, problem: "used" });
  });

  it("using one token closes the user's other open tokens, not other users'", async () => {
    const store = new MemoryResetStore();
    const a = await createResetToken(store, "u1", T0);
    const b = await createResetToken(store, "u1", T0);
    const other = await createResetToken(store, "u2", T0);
    expect((await consumeResetToken(store, b, T0)).ok).toBe(true);
    expect(await consumeResetToken(store, a, T0)).toEqual({ ok: false, problem: "used" });
    expect((await consumeResetToken(store, other, T0)).ok).toBe(true);
  });

  it("loses the race cleanly if the row was used in between", async () => {
    const store = new MemoryResetStore();
    const token = await createResetToken(store, "u1", T0);
    store.markUsed = async () => false;
    expect(await consumeResetToken(store, token, T0)).toEqual({ ok: false, problem: "used" });
  });
});

describe("SupabaseResetStore", () => {
  it("marks used with a conditional update (used_at is null) and reports a lost race", async () => {
    const calls: string[] = [];
    let rows: unknown[] = [{ id: "r1" }];
    const chain: Record<string, (...a: unknown[]) => unknown> = {};
    for (const m of ["update", "eq", "neq", "is", "select"]) {
      chain[m] = (...args: unknown[]) => {
        calls.push(`${m}(${args.map((x) => JSON.stringify(x)).join(",")})`);
        return m === "select" ? Promise.resolve({ data: rows, error: null }) : chain;
      };
    }
    const store = new SupabaseResetStore({ from: () => chain });
    expect(await store.markUsed("r1", "2026-11-16T12:00:00.000Z")).toBe(true);
    expect(calls).toContain('is("used_at",null)');
    rows = [];
    expect(await store.markUsed("r1", "2026-11-16T12:00:00.000Z")).toBe(false);
  });
});

describe("passwordProblem", () => {
  it("needs at least 8 characters and at most 72 bytes", () => {
    expect(passwordProblem("1234567")).toMatch(/at least 8/);
    expect(passwordProblem(undefined)).toMatch(/at least 8/);
    expect(passwordProblem("12345678")).toBeNull();
    expect(passwordProblem("a".repeat(73))).toMatch(/too long/);
  });
});

describe("emails", () => {
  it("reset email links to /admin/reset-password on NEXT_PUBLIC_APP_URL", () => {
    const mail = resetRequestEmail("tok_123", { NEXT_PUBLIC_APP_URL: "https://abeiku.com/" } as unknown as NodeJS.ProcessEnv);
    expect(mail.html).toContain("https://abeiku.com/admin/reset-password?token=tok_123");
    expect(mail.text).toContain("https://abeiku.com/admin/reset-password?token=tok_123");
    expect(mail.text).toMatch(/1 hour/);
  });
  it("changed email tells them to reply to hello@abeiku.com if it wasn't them", () => {
    const mail = passwordChangedEmail({ NEXT_PUBLIC_APP_URL: "https://abeiku.com" } as unknown as NodeJS.ProcessEnv);
    expect(mail.text).toContain("If this wasn't you, reply to hello@abeiku.com");
  });
});
