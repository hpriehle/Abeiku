// One-time email links for partner accounts (table `partner_tokens`,
// docs/go-live-p2-signup-payouts.sql): "confirm your email" after sign-up, and "forgot password".
// Same rules as the hotel admin reset links (src/lib/auth/password-reset.ts): the link carries 32
// random bytes, the database keeps only their SHA-256, a link works once and until it expires, and
// using it closes the account's other open links of the same kind.

import { hashToken, newToken, type TokenProblem } from "@/lib/auth/password-reset";

export type TokenPurpose = "confirm_email" | "reset_password";

export const TOKEN_TTL_MS: Record<TokenPurpose, number> = {
  confirm_email: 48 * 60 * 60 * 1000,
  reset_password: 60 * 60 * 1000,
};

export interface PartnerTokenRow {
  id: string;
  account_id: string;
  purpose: TokenPurpose;
  token_hash: string;
  expires_at: string;
  used_at: string | null;
}

export interface PartnerTokenStore {
  insert(row: Omit<PartnerTokenRow, "id" | "used_at">): Promise<void>;
  findByHash(tokenHash: string, purpose: TokenPurpose): Promise<PartnerTokenRow | null>;
  /** Sets used_at only if still unused. False if someone else used it first. */
  markUsed(id: string, atIso: string): Promise<boolean>;
  closeOthers(accountId: string, purpose: TokenPurpose, exceptId: string, atIso: string): Promise<void>;
}

export async function createPartnerToken(
  store: PartnerTokenStore,
  accountId: string,
  purpose: TokenPurpose,
  now = Date.now()
): Promise<string> {
  const token = newToken();
  await store.insert({
    account_id: accountId,
    purpose,
    token_hash: hashToken(token),
    expires_at: new Date(now + TOKEN_TTL_MS[purpose]).toISOString(),
  });
  return token;
}

export type PartnerTokenCheck = { ok: true; row: PartnerTokenRow } | { ok: false; problem: TokenProblem };

export async function checkPartnerToken(
  store: PartnerTokenStore,
  token: unknown,
  purpose: TokenPurpose,
  now = Date.now()
): Promise<PartnerTokenCheck> {
  if (typeof token !== "string" || token.length < 20 || token.length > 200) return { ok: false, problem: "invalid" };
  const row = await store.findByHash(hashToken(token), purpose);
  if (!row) return { ok: false, problem: "invalid" };
  if (row.used_at) return { ok: false, problem: "used" };
  if (new Date(row.expires_at).getTime() <= now) return { ok: false, problem: "expired" };
  return { ok: true, row };
}

/** Checks and uses a link (once; closes the account's other links of this kind). */
export async function consumePartnerToken(
  store: PartnerTokenStore,
  token: unknown,
  purpose: TokenPurpose,
  now = Date.now()
): Promise<{ ok: true; accountId: string } | { ok: false; problem: TokenProblem }> {
  const check = await checkPartnerToken(store, token, purpose, now);
  if (!check.ok) return check;
  const at = new Date(now).toISOString();
  if (!(await store.markUsed(check.row.id, at))) return { ok: false, problem: "used" };
  await store.closeOthers(check.row.account_id, purpose, check.row.id, at);
  return { ok: true, accountId: check.row.account_id };
}

export class MemoryPartnerTokenStore implements PartnerTokenStore {
  rows: PartnerTokenRow[] = [];
  private seq = 0;
  async insert(row: Omit<PartnerTokenRow, "id" | "used_at">) {
    this.rows.push({ ...row, id: `t${++this.seq}`, used_at: null });
  }
  async findByHash(tokenHash: string, purpose: TokenPurpose) {
    return this.rows.find((r) => r.token_hash === tokenHash && r.purpose === purpose) ?? null;
  }
  async markUsed(id: string, atIso: string) {
    const row = this.rows.find((r) => r.id === id);
    if (!row || row.used_at) return false;
    row.used_at = atIso;
    return true;
  }
  async closeOthers(accountId: string, purpose: TokenPurpose, exceptId: string, atIso: string) {
    for (const r of this.rows) {
      if (r.account_id === accountId && r.purpose === purpose && r.id !== exceptId && !r.used_at) r.used_at = atIso;
    }
  }
}
