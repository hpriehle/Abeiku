// P2 step 2: anyone can create a partner account (name, email, WhatsApp, password). The email is
// confirmed by a one-time link before the account can sign in. Forgot password works like the
// hotel admin one, with partner_tokens instead of password_resets. I/O is injected so this is
// testable; the routes under src/app/api/partner/auth wire in Supabase, Resend and the rate limiter.
//
// Needs both SQL files: docs/go-live-p2-accounts.sql (partner_accounts) and
// docs/go-live-p2-signup-payouts.sql (partner_tokens, email_confirm_pending). Until then sign-up
// answers 503, forgot password answers as usual but sends nothing, and sign-in works as before.

import {
  checkLimit,
  hashKey,
  recordFailure,
  tooManyMessage,
  RESET_REQUEST_ACCOUNT_LIMIT,
  RESET_REQUEST_IP_LIMIT,
  type AttemptStore,
  type Limit,
} from "@/lib/auth/rate-limit";
import { passwordProblem, SENT_MESSAGE, tokenProblemMessage } from "@/lib/auth/password-reset";
import type { AccountStore, Membership, PartnerAccount } from "./accounts";
import type { HandlerResult } from "./bulk";
import { normalizeEmail, normalizeWhatsapp } from "./codes";
import { CONFIRM, SIGNUP, confirmEmail, partnerPasswordChangedEmail, partnerResetEmail } from "./p2-copy";
import { checkPartnerToken, consumePartnerToken, createPartnerToken, type PartnerTokenStore } from "./tokens";

/** Same as hotel sign-up (src/app/api/signup/route.ts): 5 new accounts per hour per IP. */
export const PARTNER_SIGNUP_LIMIT: Limit = { max: 5, windowMs: 60 * 60 * 1000 };

export interface SignupStore {
  /** False until docs/go-live-p2-signup-payouts.sql has run. */
  ready(): Promise<boolean>;
  /** New account that must confirm its email before signing in. */
  createPendingAccount(row: { email: string; whatsapp: string; name: string; password_hash: string }): Promise<PartnerAccount>;
  /** True only for a self-signed-up account whose email is not confirmed. False before the SQL. */
  confirmPending(accountId: string): Promise<boolean>;
  markConfirmed(accountId: string): Promise<void>;
  tokens: PartnerTokenStore;
}

export interface SignupDeps {
  accounts: AccountStore;
  signup: SignupStore;
  attempts: AttemptStore;
  hash(password: string): Promise<string>;
  sendEmail(msg: { to: string; subject: string; html: string; text: string }): Promise<{ success: boolean; error?: string }>;
  now?: number;
}

async function bothReady(deps: Pick<SignupDeps, "accounts" | "signup">): Promise<boolean> {
  return (await deps.accounts.ready()) && (await deps.signup.ready());
}

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === "23505";
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export async function handlePartnerSignup(body: unknown, ip: string, deps: SignupDeps): Promise<HandlerResult> {
  const b = (body ?? {}) as Record<string, unknown>;
  const name = str(b.name);
  if (!name || name.length > 100) return { status: 400, body: { error: SIGNUP.errName, field: "name" } };
  const email = normalizeEmail(str(b.email));
  if (!email || email.length > 254) return { status: 400, body: { error: SIGNUP.errEmail, field: "email" } };
  const whatsapp = normalizeWhatsapp(str(b.whatsapp));
  if (!whatsapp) return { status: 400, body: { error: SIGNUP.errWhatsapp, field: "whatsapp" } };
  const pwProblem = passwordProblem(b.password);
  if (pwProblem) return { status: 400, body: { error: pwProblem, field: "password" } };

  const keys = [`partner-signup:ip:${hashKey(ip)}`];
  const check = await checkLimit(deps.attempts, keys, PARTNER_SIGNUP_LIMIT, deps.now);
  if (!check.allowed) {
    return { status: 429, body: { error: tooManyMessage(check.retryAfterSec) } };
  }

  if (!(await bothReady(deps))) {
    console.error("[partner-signup] run docs/go-live-p2-accounts.sql and docs/go-live-p2-signup-payouts.sql");
    return { status: 503, body: { error: SIGNUP.errNotReady } };
  }

  const taken = { status: 409, body: { error: SIGNUP.errEmailTaken, field: "email" } };
  if (await deps.accounts.findAccountByEmail(email)) return taken;
  if ((await deps.accounts.findMembershipsByEmail(email)).length > 0) return taken;

  let account: PartnerAccount;
  try {
    account = await deps.signup.createPendingAccount({
      email,
      whatsapp,
      name,
      password_hash: await deps.hash(b.password as string),
    });
  } catch (err) {
    if (isUniqueViolation(err)) return taken; // same email signed up at the same moment
    throw err;
  }
  await recordFailure(deps.attempts, keys, deps.now); // successful sign-ups count toward the limit

  await sendConfirmLink(account, deps);
  return { status: 200, body: { success: true, email } };
}

async function sendConfirmLink(account: PartnerAccount, deps: SignupDeps): Promise<void> {
  if (!account.email) return;
  try {
    const token = await createPartnerToken(deps.signup.tokens, account.id, "confirm_email", deps.now);
    const result = await deps.sendEmail({ to: account.email, ...confirmEmail(account.name, token) });
    if (!result.success) console.error("[partner-signup] confirm email failed:", result.error);
  } catch (err) {
    console.error("[partner-signup] confirm link failed:", (err as Error).message);
  }
}

export type ConfirmResult =
  | { ok: true; account: PartnerAccount; membership: Membership | null }
  | { ok: false; status: number; error: string; problem: string };

/** The confirm link: once only. On success the caller signs the partner in. */
export async function confirmPartnerEmail(token: unknown, deps: SignupDeps): Promise<ConfirmResult> {
  if (!(await bothReady(deps))) return { ok: false, status: 400, error: CONFIRM.invalid, problem: "invalid" };
  const used = await consumePartnerToken(deps.signup.tokens, token, "confirm_email", deps.now);
  if (!used.ok) return { ok: false, status: 400, error: CONFIRM[used.problem], problem: used.problem };
  await deps.signup.markConfirmed(used.accountId);
  const account = await deps.accounts.getAccount(used.accountId);
  if (!account) return { ok: false, status: 400, error: CONFIRM.invalid, problem: "invalid" };
  const [first] = await deps.accounts.listMemberships(account.id);
  return { ok: true, account, membership: first ?? null };
}

function emailLimitKeys(kind: "partner-reset" | "partner-confirm", ip: string, email: string) {
  return { ip: `${kind}:ip:${hashKey(ip)}`, account: `${kind}:acct:${hashKey(email)}` };
}

/** Rate limit for "send me a link" requests: every request counts (same limits as hotel reset). */
async function linkRequestAllowed(
  kind: "partner-reset" | "partner-confirm",
  ip: string,
  email: string,
  deps: SignupDeps
): Promise<HandlerResult | null> {
  const keys = emailLimitKeys(kind, ip, email);
  const [ipCheck, acctCheck] = await Promise.all([
    checkLimit(deps.attempts, [keys.ip], RESET_REQUEST_IP_LIMIT, deps.now),
    checkLimit(deps.attempts, [keys.account], RESET_REQUEST_ACCOUNT_LIMIT, deps.now),
  ]);
  if (!ipCheck.allowed || !acctCheck.allowed) {
    return { status: 429, body: { error: tooManyMessage(Math.max(ipCheck.retryAfterSec, acctCheck.retryAfterSec)) } };
  }
  await recordFailure(deps.attempts, [keys.ip, keys.account], deps.now);
  return null;
}

function emailFrom(body: unknown): string | null {
  const e = normalizeEmail(str((body as Record<string, unknown> | null)?.email));
  return e && e.length <= 254 ? e : null;
}

/** "Send the link again" on the sign-in page. Same answer whether or not anything was sent. */
export async function handleResendConfirm(body: unknown, ip: string, deps: SignupDeps): Promise<HandlerResult> {
  const email = emailFrom(body);
  if (!email) return { status: 400, body: { error: SIGNUP.errEmail } };
  const limited = await linkRequestAllowed("partner-confirm", ip, email, deps);
  if (limited) return limited;
  try {
    if (await bothReady(deps)) {
      const account = await deps.accounts.findAccountByEmail(email);
      if (account && (await deps.signup.confirmPending(account.id))) await sendConfirmLink(account, deps);
    }
  } catch (err) {
    console.error("[partner-confirm] resend failed:", (err as Error).message);
  }
  return { status: 200, body: { success: true, message: CONFIRM.resent } };
}

/** Partner "forgot password". Same answer whether or not the email has an account. */
export async function handlePartnerForgot(body: unknown, ip: string, deps: SignupDeps): Promise<HandlerResult> {
  const email = emailFrom(body);
  if (!email) return { status: 400, body: { error: "Please enter your email address." } };
  const limited = await linkRequestAllowed("partner-reset", ip, email, deps);
  if (limited) return limited;
  try {
    if (await bothReady(deps)) {
      const account = await deps.accounts.findAccountByEmail(email);
      if (account?.email) {
        const token = await createPartnerToken(deps.signup.tokens, account.id, "reset_password", deps.now);
        const result = await deps.sendEmail({ to: account.email, ...partnerResetEmail(token) });
        if (!result.success) console.error("[partner-forgot] email failed:", result.error);
      }
    } else {
      console.error("[partner-forgot] not sent: run docs/go-live-p2-signup-payouts.sql");
    }
  } catch (err) {
    // Logged only: the answer must not tell anyone whether the email exists.
    console.error("[partner-forgot] could not create reset:", (err as Error).message);
  }
  return { status: 200, body: { success: true, message: SENT_MESSAGE } };
}

/**
 * Reset link used: new password for the account (all its hotels). The link went to the account's
 * email, so it also confirms that email.
 */
export async function handlePartnerReset(body: unknown, deps: SignupDeps): Promise<HandlerResult & { accountEmail?: string }> {
  const b = (body ?? {}) as Record<string, unknown>;
  const pwProblem = passwordProblem(b.password);
  if (pwProblem) return { status: 400, body: { error: pwProblem } };
  if (!(await bothReady(deps))) {
    return { status: 400, body: { error: tokenProblemMessage("invalid"), linkProblem: "invalid" } };
  }
  // Check first so a bad link doesn't cost a bcrypt hash; then use it (once, race-safe).
  const check = await checkPartnerToken(deps.signup.tokens, b.token, "reset_password", deps.now);
  if (!check.ok) return { status: 400, body: { error: tokenProblemMessage(check.problem), linkProblem: check.problem } };
  const passwordHash = await deps.hash(b.password as string);
  const used = await consumePartnerToken(deps.signup.tokens, b.token, "reset_password", deps.now);
  if (!used.ok) return { status: 400, body: { error: tokenProblemMessage(used.problem), linkProblem: used.problem } };

  await deps.accounts.setAccountPassword(used.accountId, passwordHash);
  await deps.signup.markConfirmed(used.accountId);
  const account = await deps.accounts.getAccount(used.accountId);
  if (account?.email) {
    const result = await deps.sendEmail({ to: account.email, ...partnerPasswordChangedEmail() });
    if (!result.success) console.error("[partner-reset] changed email failed:", result.error);
  }
  return { status: 200, body: { success: true }, accountEmail: account?.email ?? undefined };
}
