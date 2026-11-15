// Attempt limits for logins and MoMo verification (F2 item 5, audit B8).
//
// Netlify functions are stateless, so attempts are kept in Supabase table
// `auth_attempts` (supabase-migration-f2-reliability.sql, additive). If that
// table is missing or Supabase errors, we fall back to an in-memory store for
// this function instance and log it, so login keeps working; the limit is then
// only per warm instance until the migration is applied.
//
// Keys never hold an email in clear: account keys are SHA-256 hashed.

import { createHash } from "crypto";

export interface AttemptStore {
  /** Timestamps (ms) of failed attempts for `key` at or after `sinceMs`, oldest first. */
  recent(key: string, sinceMs: number): Promise<number[]>;
  add(key: string, atMs: number): Promise<void>;
  clear(key: string): Promise<void>;
}

export interface Limit {
  max: number;
  windowMs: number;
}

export const LOGIN_LIMIT: Limit = { max: 10, windowMs: 15 * 60 * 1000 };
export const MOMO_CONFIRM_LIMIT: Limit = { max: 5, windowMs: 30 * 60 * 1000 };

export function hashKey(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex").slice(0, 32);
}

/** Client IP as Netlify / proxies report it. */
export function clientIp(headers: Headers): string {
  const nf = headers.get("x-nf-client-connection-ip");
  if (nf) return nf.trim();
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return headers.get("x-real-ip")?.trim() || "unknown";
}

export function loginKeys(scope: "admin" | "partner", ip: string, account: string): string[] {
  return [`${scope}:ip:${ip}`, `${scope}:acct:${hashKey(account)}`];
}

export interface LimitCheck {
  allowed: boolean;
  /** Seconds until the oldest counted attempt leaves the window (when blocked). */
  retryAfterSec: number;
}

/** Blocked when any key already has `max` failures inside the window. */
export async function checkLimit(store: AttemptStore, keys: string[], limit: Limit, now = Date.now()): Promise<LimitCheck> {
  const since = now - limit.windowMs;
  let retryAfterMs = 0;
  for (const key of keys) {
    const times = await store.recent(key, since);
    if (times.length >= limit.max) {
      const oldestCounted = times[times.length - limit.max];
      retryAfterMs = Math.max(retryAfterMs, oldestCounted + limit.windowMs - now);
    }
  }
  return { allowed: retryAfterMs <= 0, retryAfterSec: Math.max(0, Math.ceil(retryAfterMs / 1000)) };
}

export async function recordFailure(store: AttemptStore, keys: string[], now = Date.now()): Promise<void> {
  for (const key of keys) await store.add(key, now);
}

export async function clearKeys(store: AttemptStore, keys: string[]): Promise<void> {
  for (const key of keys) await store.clear(key);
}

export function tooManyMessage(retryAfterSec: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterSec / 60));
  return `Too many attempts. Please wait ${minutes} minute${minutes === 1 ? "" : "s"} and try again.`;
}

// --- Stores ---

export class MemoryAttemptStore implements AttemptStore {
  private map = new Map<string, number[]>();
  async recent(key: string, sinceMs: number) {
    const list = (this.map.get(key) ?? []).filter((t) => t >= sinceMs);
    this.map.set(key, list);
    return [...list];
  }
  async add(key: string, atMs: number) {
    const list = this.map.get(key) ?? [];
    list.push(atMs);
    // Bound memory: keep the newest 50 per key.
    this.map.set(key, list.slice(-50));
  }
  async clear(key: string) {
    this.map.delete(key);
  }
}

type SupabaseLike = {
  from: (table: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

export class SupabaseAttemptStore implements AttemptStore {
  constructor(private db: SupabaseLike, private table = "auth_attempts") {}
  async recent(key: string, sinceMs: number) {
    const { data, error } = await this.db
      .from(this.table)
      .select("attempted_at")
      .eq("key", key)
      .gte("attempted_at", new Date(sinceMs).toISOString())
      .order("attempted_at", { ascending: true })
      .limit(100);
    if (error) throw new Error(error.message);
    return ((data ?? []) as { attempted_at: string }[]).map((r) => new Date(r.attempted_at).getTime());
  }
  async add(key: string, atMs: number) {
    const { error } = await this.db.from(this.table).insert({ key, attempted_at: new Date(atMs).toISOString() });
    if (error) throw new Error(error.message);
    // Housekeeping now and then: drop rows older than a day.
    if (Math.random() < 0.05) {
      await this.db
        .from(this.table)
        .delete()
        .lt("attempted_at", new Date(atMs - 24 * 60 * 60 * 1000).toISOString());
    }
  }
  async clear(key: string) {
    const { error } = await this.db.from(this.table).delete().eq("key", key);
    if (error) throw new Error(error.message);
  }
}

/** Uses `primary`; on any error switches to `fallback` (and logs once per instance). */
export class FallbackAttemptStore implements AttemptStore {
  private warned = false;
  constructor(private primary: AttemptStore, private fallback: AttemptStore) {}
  private async use<T>(fn: (s: AttemptStore) => Promise<T>): Promise<T> {
    try {
      return await fn(this.primary);
    } catch (err) {
      if (!this.warned) {
        console.error("[rate-limit] Supabase store failed, using in-memory limits:", (err as Error).message);
        this.warned = true;
      }
      return fn(this.fallback);
    }
  }
  recent(key: string, sinceMs: number) {
    return this.use((s) => s.recent(key, sinceMs));
  }
  async add(key: string, atMs: number) {
    // Always keep the memory copy too, so a later Supabase failure still counts these.
    await this.fallback.add(key, atMs);
    try {
      await this.primary.add(key, atMs);
    } catch (err) {
      if (!this.warned) {
        console.error("[rate-limit] Supabase store failed, using in-memory limits:", (err as Error).message);
        this.warned = true;
      }
    }
  }
  async clear(key: string) {
    await this.fallback.clear(key);
    try {
      await this.primary.clear(key);
    } catch {
      // logged by other calls
    }
  }
}

let defaultStore: AttemptStore | null = null;

/** Shared store for API routes (Supabase with in-memory fallback). */
export async function getAttemptStore(): Promise<AttemptStore> {
  if (!defaultStore) {
    const { supabase } = await import("@/lib/supabase/client");
    defaultStore = new FallbackAttemptStore(new SupabaseAttemptStore(supabase), new MemoryAttemptStore());
  }
  return defaultStore;
}
