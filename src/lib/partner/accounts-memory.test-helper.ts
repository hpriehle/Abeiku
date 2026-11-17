// In-memory AccountStore for tests (mirrors lib/db/partner-accounts.ts).
import type { Influencer } from "@/lib/db/influencers";
import type { AccountStore, PartnerAccount } from "./accounts";

export function membership(over: Partial<Influencer>): Influencer {
  return {
    id: "m0",
    hotel_id: "hotel-a",
    slug: "ama",
    name: "Ama",
    email: null,
    whatsapp: null,
    town: null,
    ghl_contact_id: null,
    password_hash: null,
    invite_token: null,
    invite_expires_at: null,
    redirect_url: "/",
    created_at: "2026-11-01T00:00:00Z",
    last_login_at: null,
    partner_type: "agency",
    country: "Ghana",
    currency: "GHS",
    commission_kind: "percent",
    commission_value: 15,
    commission_currency: "GHS",
    account_id: null,
    ...over,
  };
}

export function memoryAccountStore(opts: { ready?: boolean; accounts?: PartnerAccount[]; memberships?: Influencer[] } = {}) {
  const ready = opts.ready ?? true;
  const accounts = (opts.accounts ?? []).map((a) => ({ ...a }));
  const rows = (opts.memberships ?? []).map((m) => ({ ...m }));
  let seq = 0;
  const calls = { createAccount: 0, setAccountPassword: 0, link: 0, markAccountLogin: 0 };
  const byCreated = (a: Influencer, b: Influencer) => a.created_at.localeCompare(b.created_at);
  // Before the SQL, any account query fails (missing table); the code must not call them.
  const guard = () => {
    if (!ready) throw new Error("partner_accounts does not exist");
  };
  const store: AccountStore = {
    async ready() {
      return ready;
    },
    async getAccount(id) {
      guard();
      return accounts.find((a) => a.id === id) ?? null;
    },
    async findAccountByEmail(email) {
      guard();
      return accounts.find((a) => a.email?.toLowerCase() === email.toLowerCase()) ?? null;
    },
    async findAccountsByWhatsapp(whatsapp) {
      guard();
      return accounts.filter((a) => a.whatsapp === whatsapp);
    },
    async createAccount(row) {
      guard();
      calls.createAccount++;
      const a = { ...row, id: `acc-new${++seq}` };
      accounts.push(a);
      return { ...a };
    },
    async setAccountPassword(id, hash) {
      guard();
      calls.setAccountPassword++;
      accounts.find((a) => a.id === id)!.password_hash = hash;
      for (const m of rows) if (m.account_id === id) m.password_hash = hash;
    },
    async markAccountLogin() {
      guard();
      calls.markAccountLogin++;
    },
    async linkMembership(id, accountId, hash) {
      guard();
      calls.link++;
      const m = rows.find((r) => r.id === id)!;
      m.account_id = accountId;
      if (hash) m.password_hash = hash;
    },
    async listMemberships(accountId) {
      guard();
      return rows.filter((m) => m.account_id === accountId).sort(byCreated).map((m) => ({ ...m }));
    },
    async getMembership(id) {
      const m = rows.find((r) => r.id === id);
      return m ? { ...m } : null;
    },
    async findMembershipsByEmail(email) {
      return rows.filter((m) => m.email === email.toLowerCase()).sort(byCreated).map((m) => ({ ...m }));
    },
    async findMembershipsByWhatsapp(whatsapp) {
      return rows.filter((m) => m.whatsapp === whatsapp).sort(byCreated).map((m) => ({ ...m }));
    },
  };
  return { store, accounts, rows, calls };
}

/** Fake bcrypt: "hash:<password>". */
export const fakeVerify = async (password: string, hash: string) => hash === `hash:${password}`;
