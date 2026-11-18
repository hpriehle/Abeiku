// Account state of a hotel admin that the session check and the account page need
// (docs/go-live-l3-account.sql): `admin_users.session_version` and `admin_users.email_verified_at`.
//
// Session version: every admin session carries the version it was issued with (claim `sv`; tokens
// from before this change have none and count as 0). A password reset or change bumps the version,
// so every session issued before it stops working on its next request.
//
// Until the SQL has run, the columns are missing: nothing is revoked, everyone counts as verified,
// and the problem is logged (once per process).

type SupabaseLike = {
  from: (table: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

export interface AccountState {
  /** False if the admin user no longer exists. */
  exists: boolean;
  /** Null when the column is missing (the check is skipped). */
  sessionVersion: number | null;
  /** Null when the column is missing (counts as verified). */
  emailVerified: boolean | null;
}

const UNKNOWN: AccountState = { exists: true, sessionVersion: null, emailVerified: null };

export function isMissingSchemaError(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  if (!e) return false;
  if (e.code && ["42703", "42P01", "PGRST204", "PGRST205"].includes(e.code)) return true;
  return /column .* does not exist|could not find the .* column|relation .* does not exist|could not find the table/i.test(
    e.message ?? ""
  );
}

let warned = false;
function warnMissing(where: string, err: unknown) {
  if (warned) return;
  warned = true;
  console.error(
    `[account] ${where}: admin_users.session_version / email_verified_at missing, run docs/go-live-l3-account.sql:`,
    (err as Error)?.message ?? err
  );
}

export async function readAccountState(db: SupabaseLike, userId: string): Promise<AccountState> {
  const { data, error } = await db
    .from("admin_users")
    .select("id, session_version, email_verified_at")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    if (isMissingSchemaError(error)) {
      warnMissing("read", error);
      return UNKNOWN;
    }
    throw new Error(error.message);
  }
  if (!data) return { exists: false, sessionVersion: null, emailVerified: null };
  const row = data as { session_version?: number | null; email_verified_at?: string | null };
  return {
    exists: true,
    sessionVersion: typeof row.session_version === "number" ? row.session_version : 0,
    emailVerified: !!row.email_verified_at,
  };
}

/** The `sv` claim of a token: missing or odd values count as 0 (tokens from before this change). */
export function claimVersion(sv: unknown): number {
  return typeof sv === "number" && Number.isInteger(sv) && sv >= 0 ? sv : 0;
}

/** Whether a session with claim `sv` is still good for this account. */
export function sessionIsCurrent(sv: unknown, state: AccountState): boolean {
  if (!state.exists) return false;
  if (state.sessionVersion === null) return true;
  return claimVersion(sv) >= state.sessionVersion;
}

/**
 * Ends every session of this admin issued before now. Returns the new version (put it in the
 * session of whoever made the change so they stay signed in), or null if the column is missing.
 */
export async function bumpSessionVersion(db: SupabaseLike, userId: string): Promise<number | null> {
  const state = await readAccountState(db, userId);
  if (state.sessionVersion === null) return null;
  const next = state.sessionVersion + 1;
  const { error } = await db.from("admin_users").update({ session_version: next }).eq("id", userId);
  if (error) {
    if (isMissingSchemaError(error)) {
      warnMissing("bump", error);
      return null;
    }
    throw new Error(error.message);
  }
  return next;
}

/** Marks the login email confirmed. False if the column is missing. */
export async function markEmailVerified(db: SupabaseLike, userId: string, atIso: string): Promise<boolean> {
  const { error } = await db.from("admin_users").update({ email_verified_at: atIso }).eq("id", userId);
  if (error) {
    if (isMissingSchemaError(error)) {
      warnMissing("verify", error);
      return false;
    }
    throw new Error(error.message);
  }
  return true;
}

export type EmailChangeResult = "ok" | "taken";

/** Switches the login email to an address that was just confirmed. */
export async function switchLoginEmail(
  db: SupabaseLike,
  userId: string,
  newEmail: string,
  atIso: string
): Promise<EmailChangeResult> {
  const { error } = await db
    .from("admin_users")
    .update({ email: newEmail.toLowerCase(), email_verified_at: atIso })
    .eq("id", userId);
  if (!error) return "ok";
  if ((error as { code?: string }).code === "23505") return "taken";
  if (isMissingSchemaError(error)) {
    warnMissing("switch email", error);
    const retry = await db.from("admin_users").update({ email: newEmail.toLowerCase() }).eq("id", userId);
    if (!retry.error) return "ok";
    if ((retry.error as { code?: string }).code === "23505") return "taken";
    throw new Error(retry.error.message);
  }
  throw new Error(error.message);
}

export async function getAccountDb(): Promise<SupabaseLike> {
  const { supabase } = await import("@/lib/supabase/client");
  return supabase;
}

/** Normalised email, or null if it doesn't look like one. */
export function normaliseEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}
