// Supabase storage for P2 partner sign-up: pending accounts and partner_tokens
// (docs/go-live-p2-signup-payouts.sql). Before that SQL runs, ready() is false and confirmPending()
// is false, so sign-in works as before.

import { supabase } from "@/lib/supabase/client";
import type { PartnerAccount } from "@/lib/partner/accounts";
import type { SignupStore } from "@/lib/partner/signup";
import type { PartnerTokenRow, PartnerTokenStore, TokenPurpose } from "@/lib/partner/tokens";
import { isMissingSchema } from "./partner-accounts";

let readyCache: { value: boolean; at: number } | null = null;
const NOT_READY_TTL_MS = 60_000;

export async function signupTablesReady(): Promise<boolean> {
  if (readyCache && (readyCache.value || Date.now() - readyCache.at < NOT_READY_TTL_MS)) return readyCache.value;
  const [tokens, column] = await Promise.all([
    supabase.from("partner_tokens").select("id").limit(1),
    supabase.from("partner_accounts").select("email_confirm_pending").limit(1),
  ]);
  for (const r of [tokens, column]) {
    if (r.error && !isMissingSchema(r.error)) throw r.error;
  }
  const value = !tokens.error && !column.error;
  readyCache = { value, at: Date.now() };
  return value;
}

const tokens: PartnerTokenStore = {
  async insert(row) {
    const { error } = await supabase.from("partner_tokens").insert(row);
    if (error) throw error;
  },
  async findByHash(tokenHash: string, purpose: TokenPurpose) {
    const { data, error } = await supabase
      .from("partner_tokens")
      .select("id, account_id, purpose, token_hash, expires_at, used_at")
      .eq("token_hash", tokenHash)
      .eq("purpose", purpose)
      .maybeSingle();
    if (error) throw error;
    return (data as PartnerTokenRow | null) ?? null;
  },
  async markUsed(id, atIso) {
    // Conditional update: two tabs using the same link at once can't both win.
    const { data, error } = await supabase
      .from("partner_tokens")
      .update({ used_at: atIso })
      .eq("id", id)
      .is("used_at", null)
      .select("id");
    if (error) throw error;
    return Array.isArray(data) && data.length > 0;
  },
  async closeOthers(accountId, purpose, exceptId, atIso) {
    const { error } = await supabase
      .from("partner_tokens")
      .update({ used_at: atIso })
      .eq("account_id", accountId)
      .eq("purpose", purpose)
      .neq("id", exceptId)
      .is("used_at", null);
    if (error) throw error;
  },
};

export const supabaseSignupStore: SignupStore = {
  ready: signupTablesReady,
  tokens,

  async createPendingAccount(row) {
    const { data, error } = await supabase
      .from("partner_accounts")
      .insert({ ...row, email: row.email.toLowerCase(), email_confirm_pending: true })
      .select("id, email, whatsapp, name, password_hash")
      .single();
    if (error) throw error;
    return data as PartnerAccount;
  },

  async confirmPending(accountId) {
    const { data, error } = await supabase
      .from("partner_accounts")
      .select("email_confirm_pending")
      .eq("id", accountId)
      .maybeSingle();
    if (error) {
      if (isMissingSchema(error)) return false; // SQL not run: no self-signed-up accounts exist
      throw error;
    }
    return Boolean((data as { email_confirm_pending?: boolean } | null)?.email_confirm_pending);
  },

  async markConfirmed(accountId) {
    const { error } = await supabase
      .from("partner_accounts")
      .update({ email_confirm_pending: false, email_confirmed_at: new Date().toISOString() })
      .eq("id", accountId);
    if (error) throw error;
  },
};
