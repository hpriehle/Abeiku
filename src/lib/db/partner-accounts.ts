import { supabase } from "@/lib/supabase/client";
import type { AccountStore, NewAccount, PartnerAccount } from "@/lib/partner/accounts";
import type { Influencer } from "./influencers";

const ACCOUNT_COLUMNS = "id, email, whatsapp, name, password_hash";

/** Postgres / PostgREST errors for a table or column that does not exist (yet). */
export function isMissingSchema(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  if (!e) return false;
  if (e.code && ["42P01", "42703", "PGRST205", "PGRST204", "PGRST200"].includes(e.code)) return true;
  return /does not exist|could not find the (table|column)/i.test(e.message ?? "");
}

// Once the SQL has run it stays run: cache "ready" for good, "not ready" for a minute.
let readyCache: { value: boolean; at: number } | null = null;
const NOT_READY_TTL_MS = 60_000;

export async function accountsReady(): Promise<boolean> {
  if (readyCache && (readyCache.value || Date.now() - readyCache.at < NOT_READY_TTL_MS)) return readyCache.value;
  const [table, column] = await Promise.all([
    supabase.from("partner_accounts").select("id").limit(1),
    supabase.from("influencers").select("account_id").limit(1),
  ]);
  for (const r of [table, column]) {
    if (r.error && !isMissingSchema(r.error)) throw r.error;
  }
  const value = !table.error && !column.error;
  readyCache = { value, at: Date.now() };
  return value;
}

export const supabaseAccountStore: AccountStore = {
  ready: accountsReady,

  async getAccount(id) {
    const { data, error } = await supabase.from("partner_accounts").select(ACCOUNT_COLUMNS).eq("id", id).maybeSingle();
    if (error) throw error;
    return data as PartnerAccount | null;
  },

  async findAccountByEmail(email) {
    // Stored lowercase (the unique index is on lower(email)).
    const { data, error } = await supabase
      .from("partner_accounts")
      .select(ACCOUNT_COLUMNS)
      .eq("email", email.toLowerCase())
      .maybeSingle();
    if (error) throw error;
    return data as PartnerAccount | null;
  },

  async findAccountsByWhatsapp(whatsapp) {
    const { data, error } = await supabase.from("partner_accounts").select(ACCOUNT_COLUMNS).eq("whatsapp", whatsapp);
    if (error) throw error;
    return (data ?? []) as PartnerAccount[];
  },

  async createAccount(row: NewAccount) {
    const { data, error } = await supabase
      .from("partner_accounts")
      .insert({ ...row, email: row.email ? row.email.toLowerCase() : null })
      .select(ACCOUNT_COLUMNS)
      .single();
    if (error) throw error;
    return data as PartnerAccount;
  },

  async setAccountPassword(accountId, passwordHash) {
    const { error } = await supabase.from("partner_accounts").update({ password_hash: passwordHash }).eq("id", accountId);
    if (error) throw error;
    const { error: e2 } = await supabase
      .from("influencers")
      .update({ password_hash: passwordHash })
      .eq("account_id", accountId);
    if (e2) throw e2;
  },

  async markAccountLogin(accountId) {
    const { error } = await supabase
      .from("partner_accounts")
      .update({ last_login_at: new Date().toISOString() })
      .eq("id", accountId);
    if (error) throw error;
  },

  async linkMembership(membershipId, accountId, passwordHash) {
    const patch: Record<string, unknown> = { account_id: accountId };
    if (passwordHash) patch.password_hash = passwordHash;
    const { error } = await supabase.from("influencers").update(patch).eq("id", membershipId);
    if (error) throw error;
  },

  async listMemberships(accountId) {
    const { data, error } = await supabase
      .from("influencers")
      .select("*")
      .eq("account_id", accountId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []) as Influencer[];
  },

  async getMembership(id) {
    const { data, error } = await supabase.from("influencers").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data as Influencer | null;
  },

  async findMembershipsByEmail(email) {
    const { data, error } = await supabase
      .from("influencers")
      .select("*")
      .eq("email", email.toLowerCase())
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []) as Influencer[];
  },

  async findMembershipsByWhatsapp(whatsapp) {
    const { data, error } = await supabase
      .from("influencers")
      .select("*")
      .eq("whatsapp", whatsapp)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []) as Influencer[];
  },
};
