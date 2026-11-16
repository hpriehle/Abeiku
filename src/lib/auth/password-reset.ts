// Forgot-password tokens for hotel admins (table `password_resets`,
// docs/go-live-password-resets.sql).
//
// The token is 32 random bytes sent only in the email link; the database keeps its SHA-256.
// A token is good for 1 hour and once. Using it also closes every other open token for that user.

import { createHash, randomBytes } from "crypto";

export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
export const MIN_PASSWORD_LENGTH = 8;
/** bcrypt only reads the first 72 bytes; longer passwords would be silently cut. */
export const MAX_PASSWORD_BYTES = 72;

/** "Forgot password" answer: the same whether or not the email has an account. */
export const SENT_MESSAGE = "If that email has an account, we've sent a link. Check your inbox (and spam folder).";

export interface ResetRow {
  id: string;
  admin_user_id: string;
  token_hash: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

export interface ResetStore {
  insert(row: { admin_user_id: string; token_hash: string; expires_at: string }): Promise<void>;
  findByHash(tokenHash: string): Promise<ResetRow | null>;
  /** Sets used_at only if still unused. Returns false if someone else used it first. */
  markUsed(id: string, atIso: string): Promise<boolean>;
  /** Sets used_at on every other unused token of this user. */
  closeOthers(adminUserId: string, exceptId: string, atIso: string): Promise<void>;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Makes a token for this user, stores its hash, returns the token for the email link. */
export async function createResetToken(store: ResetStore, adminUserId: string, now = Date.now()): Promise<string> {
  const token = newToken();
  await store.insert({
    admin_user_id: adminUserId,
    token_hash: hashToken(token),
    expires_at: new Date(now + RESET_TOKEN_TTL_MS).toISOString(),
  });
  return token;
}

export type TokenProblem = "invalid" | "expired" | "used";
export type TokenCheck = { ok: true; row: ResetRow } | { ok: false; problem: TokenProblem };

/** Looks a token up without using it. */
export async function checkResetToken(store: ResetStore, token: string, now = Date.now()): Promise<TokenCheck> {
  if (typeof token !== "string" || token.length < 20 || token.length > 200) return { ok: false, problem: "invalid" };
  const row = await store.findByHash(hashToken(token));
  if (!row) return { ok: false, problem: "invalid" };
  if (row.used_at) return { ok: false, problem: "used" };
  if (new Date(row.expires_at).getTime() <= now) return { ok: false, problem: "expired" };
  return { ok: true, row };
}

/** Checks and uses a token (single use, closes the user's other tokens). Returns the admin user id. */
export async function consumeResetToken(
  store: ResetStore,
  token: string,
  now = Date.now()
): Promise<{ ok: true; adminUserId: string } | { ok: false; problem: TokenProblem }> {
  const check = await checkResetToken(store, token, now);
  if (!check.ok) return check;
  const at = new Date(now).toISOString();
  if (!(await store.markUsed(check.row.id, at))) return { ok: false, problem: "used" };
  await store.closeOthers(check.row.admin_user_id, check.row.id, at);
  return { ok: true, adminUserId: check.row.admin_user_id };
}

/** Error text for a new password, or null if it's fine. */
export function passwordProblem(password: unknown): string | null {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES) {
    return "That password is too long. Use at most 72 characters.";
  }
  return null;
}

export function tokenProblemMessage(problem: TokenProblem): string {
  if (problem === "expired") return "This link has expired. Links work for 1 hour. Please ask for a new one.";
  if (problem === "used") return "This link has already been used. Please ask for a new one.";
  return "This link isn't valid. Please ask for a new one.";
}

// --- Stores ---

export class MemoryResetStore implements ResetStore {
  rows: ResetRow[] = [];
  private seq = 0;
  async insert(row: { admin_user_id: string; token_hash: string; expires_at: string }) {
    this.rows.push({ ...row, id: `r${++this.seq}`, used_at: null, created_at: new Date().toISOString() });
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
  async closeOthers(adminUserId: string, exceptId: string, atIso: string) {
    for (const r of this.rows) if (r.admin_user_id === adminUserId && r.id !== exceptId && !r.used_at) r.used_at = atIso;
  }
}

type SupabaseLike = {
  from: (table: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

export class SupabaseResetStore implements ResetStore {
  constructor(private db: SupabaseLike, private table = "password_resets") {}
  async insert(row: { admin_user_id: string; token_hash: string; expires_at: string }) {
    const { error } = await this.db.from(this.table).insert(row);
    if (error) throw new Error(error.message);
  }
  async findByHash(tokenHash: string) {
    const { data, error } = await this.db.from(this.table).select("*").eq("token_hash", tokenHash).maybeSingle();
    if (error) throw new Error(error.message);
    return (data as ResetRow | null) ?? null;
  }
  async markUsed(id: string, atIso: string) {
    // Conditional update: two tabs using the same link at once can't both win.
    const { data, error } = await this.db
      .from(this.table)
      .update({ used_at: atIso })
      .eq("id", id)
      .is("used_at", null)
      .select("id");
    if (error) throw new Error(error.message);
    return Array.isArray(data) && data.length > 0;
  }
  async closeOthers(adminUserId: string, exceptId: string, atIso: string) {
    const { error } = await this.db
      .from(this.table)
      .update({ used_at: atIso })
      .eq("admin_user_id", adminUserId)
      .neq("id", exceptId)
      .is("used_at", null);
    if (error) throw new Error(error.message);
  }
}

export async function getResetStore(): Promise<ResetStore> {
  const { supabase } = await import("@/lib/supabase/client");
  return new SupabaseResetStore(supabase);
}
