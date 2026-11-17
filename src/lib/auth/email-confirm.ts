// Email confirmation links for hotel admins (table `email_confirmations`,
// docs/go-live-l3-account.sql). Same pattern as forgot password (password-reset.ts): 32 random
// bytes only in the email link, SHA-256 in the database, single use.
//
// purpose "verify": confirms the login email given at sign-up.
// purpose "change": confirms a new login email; the switch happens only when the link is used.
// Using a link closes the user's other open links of the same purpose.

import { hashToken, newToken, type TokenProblem } from "./password-reset";

export const CONFIRM_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export type ConfirmPurpose = "verify" | "change";

export interface ConfirmRow {
  id: string;
  admin_user_id: string;
  email: string;
  purpose: ConfirmPurpose;
  token_hash: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

type NewConfirmRow = Pick<ConfirmRow, "admin_user_id" | "email" | "purpose" | "token_hash" | "expires_at">;

export interface ConfirmStore {
  insert(row: NewConfirmRow): Promise<void>;
  findByHash(tokenHash: string): Promise<ConfirmRow | null>;
  /** Sets used_at only if still unused. Returns false if someone else used it first. */
  markUsed(id: string, atIso: string): Promise<boolean>;
  /** Sets used_at on every other unused link of this user and purpose. */
  closeOthers(adminUserId: string, purpose: ConfirmPurpose, exceptId: string, atIso: string): Promise<void>;
}

export async function createConfirmToken(
  store: ConfirmStore,
  adminUserId: string,
  email: string,
  purpose: ConfirmPurpose,
  now = Date.now()
): Promise<string> {
  const token = newToken();
  await store.insert({
    admin_user_id: adminUserId,
    email: email.toLowerCase(),
    purpose,
    token_hash: hashToken(token),
    expires_at: new Date(now + CONFIRM_TOKEN_TTL_MS).toISOString(),
  });
  return token;
}

export type ConfirmResult = { ok: true; row: ConfirmRow } | { ok: false; problem: TokenProblem };

/** Checks and uses a link (single use, closes the user's other links of the same purpose). */
export async function consumeConfirmToken(store: ConfirmStore, token: unknown, now = Date.now()): Promise<ConfirmResult> {
  if (typeof token !== "string" || token.length < 20 || token.length > 200) return { ok: false, problem: "invalid" };
  const row = await store.findByHash(hashToken(token));
  if (!row) return { ok: false, problem: "invalid" };
  if (row.used_at) return { ok: false, problem: "used" };
  if (new Date(row.expires_at).getTime() <= now) return { ok: false, problem: "expired" };
  const at = new Date(now).toISOString();
  if (!(await store.markUsed(row.id, at))) return { ok: false, problem: "used" };
  await store.closeOthers(row.admin_user_id, row.purpose, row.id, at);
  return { ok: true, row };
}

export function confirmProblemMessage(problem: TokenProblem): string {
  if (problem === "expired") return "This link has expired. Links work for 24 hours. Sign in and ask for a new one.";
  if (problem === "used") return "This link has already been used.";
  return "This link isn't valid. Sign in and ask for a new one.";
}

// --- Stores ---

export class MemoryConfirmStore implements ConfirmStore {
  rows: ConfirmRow[] = [];
  private seq = 0;
  async insert(row: NewConfirmRow) {
    this.rows.push({ ...row, id: `c${++this.seq}`, used_at: null, created_at: new Date().toISOString() });
  }
  async findByHash(tokenHash: string) {
    return this.rows.find((r) => r.token_hash === tokenHash) ?? null;
  }
  async markUsed(id: string, atIso: string) {
    const row = this.rows.find((r) => r.id === id);
    if (!row || row.used_at) return false;
    row.used_at = atIso;
    return true;
  }
  async closeOthers(adminUserId: string, purpose: ConfirmPurpose, exceptId: string, atIso: string) {
    for (const r of this.rows) {
      if (r.admin_user_id === adminUserId && r.purpose === purpose && r.id !== exceptId && !r.used_at) r.used_at = atIso;
    }
  }
}

type SupabaseLike = {
  from: (table: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

export class SupabaseConfirmStore implements ConfirmStore {
  constructor(private db: SupabaseLike, private table = "email_confirmations") {}
  async insert(row: NewConfirmRow) {
    const { error } = await this.db.from(this.table).insert(row);
    if (error) throw new Error(error.message);
  }
  async findByHash(tokenHash: string) {
    const { data, error } = await this.db.from(this.table).select("*").eq("token_hash", tokenHash).maybeSingle();
    if (error) throw new Error(error.message);
    return (data as ConfirmRow | null) ?? null;
  }
  async markUsed(id: string, atIso: string) {
    const { data, error } = await this.db
      .from(this.table)
      .update({ used_at: atIso })
      .eq("id", id)
      .is("used_at", null)
      .select("id");
    if (error) throw new Error(error.message);
    return Array.isArray(data) && data.length > 0;
  }
  async closeOthers(adminUserId: string, purpose: ConfirmPurpose, exceptId: string, atIso: string) {
    const { error } = await this.db
      .from(this.table)
      .update({ used_at: atIso })
      .eq("admin_user_id", adminUserId)
      .eq("purpose", purpose)
      .neq("id", exceptId)
      .is("used_at", null);
    if (error) throw new Error(error.message);
  }
}

export async function getConfirmStore(): Promise<ConfirmStore> {
  const { supabase } = await import("@/lib/supabase/client");
  return new SupabaseConfirmStore(supabase);
}
