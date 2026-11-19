import { describe, expect, it, vi } from "vitest";
import {
  bumpSessionVersion,
  claimVersion,
  markEmailVerified,
  normaliseEmail,
  readAccountState,
  sessionIsCurrent,
  switchLoginEmail,
} from "./account";
import { fakeAccountDb } from "./fake-account-db";
import { createConfirmToken, consumeConfirmToken, MemoryConfirmStore, CONFIRM_TOKEN_TTL_MS } from "./email-confirm";
import { changeEmailMessage, emailChangedNotice, verifyEmailMessage } from "./account-emails";
import { hashToken } from "./password-reset";

describe("session version (#17)", () => {
  it("tokens without sv (issued before this change) count as version 0", () => {
    expect(claimVersion(undefined)).toBe(0);
    expect(claimVersion("3")).toBe(0);
    expect(claimVersion(2)).toBe(2);
  });

  it("a session is current until the account's version passes it", () => {
    expect(sessionIsCurrent(undefined, { exists: true, sessionVersion: 0, emailVerified: true })).toBe(true);
    expect(sessionIsCurrent(undefined, { exists: true, sessionVersion: 1, emailVerified: true })).toBe(false);
    expect(sessionIsCurrent(1, { exists: true, sessionVersion: 1, emailVerified: true })).toBe(true);
    expect(sessionIsCurrent(0, { exists: true, sessionVersion: 1, emailVerified: true })).toBe(false);
  });

  it("a deleted user's session is not current; missing columns skip the check", () => {
    expect(sessionIsCurrent(5, { exists: false, sessionVersion: null, emailVerified: null })).toBe(false);
    expect(sessionIsCurrent(0, { exists: true, sessionVersion: null, emailVerified: null })).toBe(true);
  });

  it("bump adds 1 and returns the new version", async () => {
    const db = fakeAccountDb([{ id: "u1", email: "a@x.com", session_version: 2 }]);
    expect(await bumpSessionVersion(db, "u1")).toBe(3);
    expect(db.rows[0].session_version).toBe(3);
  });

  it("before the SQL has run: read gives 'unknown', bump does nothing, nothing throws", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = fakeAccountDb([{ id: "u1", email: "a@x.com" }], { missingColumns: true });
    expect(await readAccountState(db, "u1")).toEqual({ exists: true, sessionVersion: null, emailVerified: null });
    expect(await bumpSessionVersion(db, "u1")).toBeNull();
    expect(await markEmailVerified(db, "u1", "2026-11-17T00:00:00Z")).toBe(false);
    spy.mockRestore();
  });

  it("reads verified state; unknown user is reported as gone", async () => {
    const db = fakeAccountDb([
      { id: "u1", email: "a@x.com", session_version: 0, email_verified_at: null },
      { id: "u2", email: "b@x.com", session_version: 1, email_verified_at: "2026-11-17T00:00:00Z" },
    ]);
    expect(await readAccountState(db, "u1")).toEqual({ exists: true, sessionVersion: 0, emailVerified: false });
    expect(await readAccountState(db, "u2")).toEqual({ exists: true, sessionVersion: 1, emailVerified: true });
    expect((await readAccountState(db, "nope")).exists).toBe(false);
  });
});

describe("login email (#7)", () => {
  it("switching to an email another admin uses is refused", async () => {
    const db = fakeAccountDb([
      { id: "u1", email: "a@x.com", session_version: 0 },
      { id: "u2", email: "b@x.com", session_version: 0 },
    ]);
    expect(await switchLoginEmail(db, "u1", "B@x.com", "2026-11-17T00:00:00Z")).toBe("taken");
    expect(await switchLoginEmail(db, "u1", "New@x.com", "2026-11-17T00:00:00Z")).toBe("ok");
    expect(db.rows[0]).toMatchObject({ email: "new@x.com", email_verified_at: "2026-11-17T00:00:00Z" });
  });

  it("normalises emails and refuses junk", () => {
    expect(normaliseEmail("  Owner@Hotel.GH ")).toBe("owner@hotel.gh");
    expect(normaliseEmail("nope")).toBeNull();
    expect(normaliseEmail("a b@c.de")).toBeNull();
    expect(normaliseEmail(42)).toBeNull();
  });
});

describe("confirm links", () => {
  it("stores only the hash, works once, for 24 hours", async () => {
    const store = new MemoryConfirmStore();
    const now = Date.parse("2026-11-17T10:00:00Z");
    const token = await createConfirmToken(store, "u1", "New@X.com", "change", now);
    expect(store.rows[0]).toMatchObject({ token_hash: hashToken(token), email: "new@x.com", purpose: "change" });
    expect(JSON.stringify(store.rows)).not.toContain(token);

    expect(await consumeConfirmToken(store, token, now + CONFIRM_TOKEN_TTL_MS)).toEqual({ ok: false, problem: "expired" });
    const used = await consumeConfirmToken(store, token, now + 1000);
    expect(used.ok).toBe(true);
    expect(await consumeConfirmToken(store, token, now + 2000)).toEqual({ ok: false, problem: "used" });
    expect(await consumeConfirmToken(store, "x".repeat(43), now)).toEqual({ ok: false, problem: "invalid" });
    expect(await consumeConfirmToken(store, undefined, now)).toEqual({ ok: false, problem: "invalid" });
  });

  it("using one link closes older links of the same purpose only", async () => {
    const store = new MemoryConfirmStore();
    const oldChange = await createConfirmToken(store, "u1", "one@x.com", "change");
    const verify = await createConfirmToken(store, "u1", "a@x.com", "verify");
    const newChange = await createConfirmToken(store, "u1", "two@x.com", "change");
    expect((await consumeConfirmToken(store, newChange)).ok).toBe(true);
    expect(await consumeConfirmToken(store, oldChange)).toEqual({ ok: false, problem: "used" });
    expect((await consumeConfirmToken(store, verify)).ok).toBe(true);
  });

  it("emails say Abeiku, carry the link, and name the operator in small print", () => {
    const env = { NEXT_PUBLIC_APP_URL: "https://abeiku.com/" } as unknown as NodeJS.ProcessEnv;
    const v = verifyEmailMessage("tok123", env);
    expect(v.subject).toBe("Confirm your email for Abeiku");
    expect(v.html).toContain("https://abeiku.com/confirm-email?token=tok123");
    expect(v.text).toContain("Abeiku, operated by Automaddie LLC");
    expect(changeEmailMessage("tok", env).text).toContain("changes only after you open this link");
    const notice = emailChangedNotice("<new>@x.com");
    expect(notice.html).toContain("&lt;new&gt;@x.com");
    expect(notice.text).toContain("hello@abeiku.com");
  });
});
