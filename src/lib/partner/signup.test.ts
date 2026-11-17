import { describe, expect, it, vi } from "vitest";
import { MemoryAttemptStore } from "@/lib/auth/rate-limit";
import { SENT_MESSAGE } from "@/lib/auth/password-reset";
import type { PartnerAccount } from "./accounts";
import { authenticate } from "./accounts";
import { fakeVerify, membership, memoryAccountStore } from "./accounts-memory.test-helper";
import {
  confirmPartnerEmail,
  handlePartnerForgot,
  handlePartnerReset,
  handlePartnerSignup,
  handleResendConfirm,
  type SignupDeps,
  type SignupStore,
} from "./signup";
import { MemoryPartnerTokenStore } from "./tokens";
import { CONFIRM, SIGNUP } from "./p2-copy";

function setup(opts: { accountsReady?: boolean; signupReady?: boolean; accounts?: PartnerAccount[]; memberships?: import("@/lib/db/influencers").Influencer[] } = {}) {
  const mem = memoryAccountStore({ ready: opts.accountsReady ?? true, accounts: opts.accounts, memberships: opts.memberships });
  const pending = new Set<string>();
  const tokens = new MemoryPartnerTokenStore();
  const signupReady = opts.signupReady ?? true;
  const signup: SignupStore = {
    ready: async () => signupReady,
    tokens,
    async createPendingAccount(row) {
      const a = await mem.store.createAccount(row);
      pending.add(a.id);
      return a;
    },
    confirmPending: async (id) => signupReady && pending.has(id),
    markConfirmed: async (id) => void pending.delete(id),
  };
  const sent: { to: string; subject: string; text: string }[] = [];
  const deps: SignupDeps = {
    accounts: mem.store,
    signup,
    attempts: new MemoryAttemptStore(),
    hash: async (pw) => `hash:${pw}`,
    sendEmail: vi.fn(async (m) => {
      sent.push(m);
      return { success: true };
    }),
    now: Date.parse("2026-11-17T12:00:00Z"),
  };
  /** Token from the last email's link. */
  const lastToken = () => /token=([^\s&]+)/.exec(sent.at(-1)!.text)![1];
  return { ...mem, deps, pending, tokens, sent, lastToken };
}

const GOOD = { name: "Kwame", email: "Kwame@Mail.com", whatsapp: "+233 24 123 4567", password: "longenough" };

describe("partner sign-up", () => {
  it("creates an unconfirmed account and emails a confirm link", async () => {
    const t = setup();
    const r = await handlePartnerSignup(GOOD, "1.1.1.1", t.deps);
    expect(r).toEqual({ status: 200, body: { success: true, email: "kwame@mail.com" } });
    expect(t.accounts).toHaveLength(1);
    expect(t.accounts[0]).toMatchObject({ email: "kwame@mail.com", whatsapp: "+233241234567", name: "Kwame", password_hash: "hash:longenough" });
    expect(t.pending.has(t.accounts[0].id)).toBe(true);
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0].to).toBe("kwame@mail.com");
    expect(t.sent[0].text).toContain("/partner/confirm?token=");
    // Only the hash is stored.
    expect(t.tokens.rows[0].token_hash).not.toBe(t.lastToken());
  });

  it("checks every field", async () => {
    const t = setup();
    expect((await handlePartnerSignup({ ...GOOD, name: " " }, "ip", t.deps)).body).toMatchObject({ error: SIGNUP.errName });
    expect((await handlePartnerSignup({ ...GOOD, email: "nope" }, "ip", t.deps)).body).toMatchObject({ error: SIGNUP.errEmail });
    expect((await handlePartnerSignup({ ...GOOD, whatsapp: "12" }, "ip", t.deps)).body).toMatchObject({ error: SIGNUP.errWhatsapp });
    expect((await handlePartnerSignup({ ...GOOD, password: "short" }, "ip", t.deps)).status).toBe(400);
    expect(t.accounts).toHaveLength(0);
  });

  it("an email that already has an account (or a hotel membership) is refused", async () => {
    const t = setup({
      accounts: [{ id: "a1", email: "kwame@mail.com", whatsapp: null, name: "K", password_hash: "x" }],
      memberships: [membership({ id: "m9", email: "old@row.com" })],
    });
    expect((await handlePartnerSignup(GOOD, "ip", t.deps)).status).toBe(409);
    expect((await handlePartnerSignup({ ...GOOD, email: "old@row.com" }, "ip", t.deps)).status).toBe(409);
    expect(t.sent).toHaveLength(0);
  });

  it("rate limit: 5 sign-ups per hour per IP, like hotel sign-up", async () => {
    const t = setup();
    for (let i = 0; i < 5; i++) {
      expect((await handlePartnerSignup({ ...GOOD, email: `p${i}@x.com` }, "9.9.9.9", t.deps)).status).toBe(200);
    }
    expect((await handlePartnerSignup({ ...GOOD, email: "p6@x.com" }, "9.9.9.9", t.deps)).status).toBe(429);
    expect((await handlePartnerSignup({ ...GOOD, email: "p7@x.com" }, "8.8.8.8", t.deps)).status).toBe(200);
  });

  it("before the SQL: 503, nothing created or sent", async () => {
    for (const t of [setup({ accountsReady: false }), setup({ signupReady: false })]) {
      const r = await handlePartnerSignup(GOOD, "ip", t.deps);
      expect(r).toEqual({ status: 503, body: { error: SIGNUP.errNotReady } });
      expect(t.calls.createAccount).toBe(0);
      expect(t.sent).toHaveLength(0);
    }
  });
});

describe("email confirmation", () => {
  it("unconfirmed sign-in is refused (right password); wrong password is just a failure", async () => {
    const t = setup();
    await handlePartnerSignup(GOOD, "ip", t.deps);
    const r = await authenticate("kwame@mail.com", "longenough", t.store, fakeVerify, t.deps.signup.confirmPending);
    expect(r).toMatchObject({ unconfirmed: true, membership: null });
    expect(await authenticate("kwame@mail.com", "wrong", t.store, fakeVerify, t.deps.signup.confirmPending)).toBeNull();
  });

  it("the confirm link works once, then the account signs in (no hotels yet)", async () => {
    const t = setup();
    await handlePartnerSignup(GOOD, "ip", t.deps);
    const token = t.lastToken();
    const first = await confirmPartnerEmail(token, t.deps);
    expect(first).toMatchObject({ ok: true, account: { email: "kwame@mail.com" }, membership: null });
    const again = await confirmPartnerEmail(token, t.deps);
    expect(again).toMatchObject({ ok: false, problem: "used", error: CONFIRM.used });

    const login = await authenticate("kwame@mail.com", "longenough", t.store, fakeVerify, t.deps.signup.confirmPending);
    expect(login).toMatchObject({ account: { email: "kwame@mail.com" }, membership: null });
    expect(login?.unconfirmed).toBeFalsy();
  });

  it("expired or made-up links are refused", async () => {
    const t = setup();
    await handlePartnerSignup(GOOD, "ip", t.deps);
    const token = t.lastToken();
    const later = { ...t.deps, now: t.deps.now! + 49 * 3600_000 };
    expect(await confirmPartnerEmail(token, later)).toMatchObject({ ok: false, problem: "expired" });
    expect(await confirmPartnerEmail("x".repeat(43), t.deps)).toMatchObject({ ok: false, problem: "invalid" });
  });

  it("resend: new link only for an unconfirmed account; same answer either way", async () => {
    const t = setup();
    await handlePartnerSignup(GOOD, "ip", t.deps);
    const r = await handleResendConfirm({ email: "kwame@mail.com" }, "ip", t.deps);
    expect(r.body).toMatchObject({ message: CONFIRM.resent });
    expect(t.sent).toHaveLength(2);
    expect((await handleResendConfirm({ email: "nobody@x.com" }, "ip", t.deps)).body).toMatchObject({ message: CONFIRM.resent });
    expect(t.sent).toHaveLength(2);
  });

  it("accounts made before sign-up existed (hotel-added) are never asked to confirm", async () => {
    const t = setup({
      accounts: [{ id: "acc", email: "ama@x.com", whatsapp: null, name: "Ama", password_hash: "hash:pw" }],
      memberships: [membership({ id: "m1", email: "ama@x.com", account_id: "acc" })],
    });
    const r = await authenticate("ama@x.com", "pw", t.store, fakeVerify, t.deps.signup.confirmPending);
    expect(r).toMatchObject({ membership: { id: "m1" } });
  });
});

describe("partner forgot password", () => {
  const ACC = { id: "acc", email: "ama@x.com", whatsapp: null, name: "Ama", password_hash: "hash:old" };

  it("emails a reset link; the link sets the account password once and confirms the email", async () => {
    const t = setup({ accounts: [ACC], memberships: [membership({ id: "m1", email: "ama@x.com", account_id: "acc" })] });
    t.pending.add("acc");
    const r = await handlePartnerForgot({ email: "AMA@x.com" }, "ip", t.deps);
    expect(r.body).toEqual({ success: true, message: SENT_MESSAGE });
    expect(t.sent[0].text).toContain("/partner/reset-password?token=");
    const token = t.lastToken();

    const done = await handlePartnerReset({ token, password: "brandnew1" }, t.deps);
    expect(done.status).toBe(200);
    expect(t.accounts[0].password_hash).toBe("hash:brandnew1");
    expect(t.rows[0].password_hash).toBe("hash:brandnew1"); // every hotel of the account
    expect(t.pending.has("acc")).toBe(false);
    expect(t.sent.at(-1)!.subject).toMatch(/password was changed/);

    const again = await handlePartnerReset({ token, password: "another12" }, t.deps);
    expect(again).toMatchObject({ status: 400, body: { linkProblem: "used" } });
    expect(t.accounts[0].password_hash).toBe("hash:brandnew1");
  });

  it("unknown email: same answer, nothing sent", async () => {
    const t = setup({ accounts: [ACC] });
    expect((await handlePartnerForgot({ email: "who@x.com" }, "ip", t.deps)).body).toEqual({ success: true, message: SENT_MESSAGE });
    expect(t.sent).toHaveLength(0);
  });

  it("rate limit: 3 requests per hour per email", async () => {
    const t = setup({ accounts: [ACC] });
    for (let i = 0; i < 3; i++) expect((await handlePartnerForgot({ email: "ama@x.com" }, "ip", t.deps)).status).toBe(200);
    expect((await handlePartnerForgot({ email: "ama@x.com" }, "ip", t.deps)).status).toBe(429);
  });

  it("before the SQL: same answer, nothing sent, reset links refused", async () => {
    const t = setup({ accounts: [ACC], signupReady: false });
    expect((await handlePartnerForgot({ email: "ama@x.com" }, "ip", t.deps)).body).toEqual({ success: true, message: SENT_MESSAGE });
    expect(t.sent).toHaveLength(0);
    expect((await handlePartnerReset({ token: "x".repeat(43), password: "brandnew1" }, t.deps)).status).toBe(400);
  });

  it("a confirm link is not a reset link", async () => {
    const t = setup();
    await handlePartnerSignup(GOOD, "ip", t.deps);
    const r = await handlePartnerReset({ token: t.lastToken(), password: "brandnew1" }, t.deps);
    expect(r).toMatchObject({ status: 400, body: { linkProblem: "invalid" } });
  });
});
