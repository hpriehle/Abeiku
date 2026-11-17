// P2 Abeiku-wide partner accounts. One account (login) per person; `influencers` rows are the
// memberships (account × hotel: code, commission, link). Storage is injected (see
// supabaseAccountStore in lib/db/partner-accounts.ts) so this is testable.
//
// Until docs/go-live-p2-accounts.sql has run, store.ready() is false and everything here behaves
// as before P2: one login per influencers row.

import type { Influencer } from "@/lib/db/influencers";
import { normalizeWhatsapp } from "./codes";

export interface PartnerAccount {
  id: string;
  email: string | null;
  whatsapp: string | null;
  name: string;
  password_hash: string | null;
}

export type NewAccount = Omit<PartnerAccount, "id">;

/** A membership is an influencers row; account_id is missing before the P2 SQL. */
export type Membership = Influencer;

export interface AccountStore {
  /** False until docs/go-live-p2-accounts.sql has run (table or column missing). */
  ready(): Promise<boolean>;
  getAccount(id: string): Promise<PartnerAccount | null>;
  findAccountByEmail(email: string): Promise<PartnerAccount | null>;
  findAccountsByWhatsapp(whatsapp: string): Promise<PartnerAccount[]>;
  createAccount(row: NewAccount): Promise<PartnerAccount>;
  /** Sets the account password and copies it to every membership of the account. */
  setAccountPassword(accountId: string, passwordHash: string): Promise<void>;
  markAccountLogin(accountId: string): Promise<void>;
  /** Links a membership to an account, optionally copying the account's password hash. */
  linkMembership(membershipId: string, accountId: string, passwordHash?: string | null): Promise<void>;
  /** Oldest first. */
  listMemberships(accountId: string): Promise<Membership[]>;
  getMembership(id: string): Promise<Membership | null>;
  findMembershipsByEmail(email: string): Promise<Membership[]>;
  findMembershipsByWhatsapp(whatsapp: string): Promise<Membership[]>;
}

/**
 * Account for a membership: its own, or a new one made from the row (password included).
 * Never merges the row into another existing account: the caller proved only this row's
 * password, which must not open someone else's hotels. Returns null in that case.
 */
export async function ensureAccount(m: Membership, store: AccountStore): Promise<PartnerAccount | null> {
  if (m.account_id) return store.getAccount(m.account_id);
  if (m.email && (await store.findAccountByEmail(m.email))) return null;
  const account = await store.createAccount({
    email: m.email,
    whatsapp: m.whatsapp,
    name: m.name,
    password_hash: m.password_hash,
  });
  await store.linkMembership(m.id, account.id);
  return account;
}

export type LoginResult =
  | {
      /** Null before the P2 SQL (or for a row that could not get an account). */
      account: PartnerAccount | null;
      /** The hotel the dashboard opens on; null for a signed-up account no hotel has added yet. */
      membership: Membership | null;
      unconfirmed?: false;
    }
  /** Right password, but a self-signed-up account whose email is not confirmed yet: refuse. */
  | { account: PartnerAccount; membership: null; unconfirmed: true };

type Verify = (password: string, hash: string) => Promise<boolean>;

/**
 * Login by email or WhatsApp number. Accounts first; then memberships without an account (rows
 * created before the SQL, or the whole table before it runs), as before P2.
 * `confirmPending` (P2 sign-up) tells a signed-up account that has not confirmed its email yet.
 */
export async function authenticate(
  login: string,
  password: string,
  store: AccountStore,
  verify: Verify,
  confirmPending: (accountId: string) => Promise<boolean> = async () => false
): Promise<LoginResult | null> {
  const byEmail = login.includes("@");
  const email = login.toLowerCase();
  const whatsapp = byEmail ? null : normalizeWhatsapp(login);
  if (!byEmail && !whatsapp) return null;
  const ready = await store.ready();

  if (ready) {
    const accounts = byEmail
      ? [await store.findAccountByEmail(email)].filter((a): a is PartnerAccount => Boolean(a))
      : await store.findAccountsByWhatsapp(whatsapp!);
    for (const a of accounts) {
      if (!a.password_hash || !(await verify(password, a.password_hash))) continue;
      if (await confirmPending(a.id)) return { account: a, membership: null, unconfirmed: true };
      const [first] = await store.listMemberships(a.id);
      if (first) return { account: a, membership: first };
      // Signed up on its own (P2 step 2) and no hotel has added it yet: the dashboard says so.
      if (a.email && (await store.findMembershipsByEmail(a.email)).length === 0) return { account: a, membership: null };
    }
  }

  const rows = byEmail ? await store.findMembershipsByEmail(email) : await store.findMembershipsByWhatsapp(whatsapp!);
  for (const m of rows) {
    // A row with an account is checked above: its own copy of the hash may be older.
    if (ready && m.account_id) continue;
    if (!m.password_hash || !(await verify(password, m.password_hash))) continue;
    return { account: ready ? await ensureAccount(m, store) : null, membership: m };
  }
  return null;
}

export type SetupOutcome =
  | { kind: "done"; account: PartnerAccount | null; membership: Membership }
  /** The row's email already has an account: the row was linked to it; log in with that password. */
  | { kind: "has_account"; membership: Membership };

/**
 * Setup / reset link used: sets the password. With accounts, the password belongs to the account
 * (made now for a new partner) and applies to every hotel of that account.
 */
export async function completeSetup(
  m: Membership,
  passwordHash: string,
  store: AccountStore,
  setRowPassword: (membershipId: string, hash: string) => Promise<void>
): Promise<SetupOutcome> {
  if (!(await store.ready())) {
    await setRowPassword(m.id, passwordHash);
    return { kind: "done", account: null, membership: m };
  }
  let account = m.account_id ? await store.getAccount(m.account_id) : null;
  if (!account) {
    const existing = m.email ? await store.findAccountByEmail(m.email) : null;
    if (existing?.password_hash) {
      // Same as a hotel adding an existing partner: the hotel shows up in their account. The link
      // does not change that account's password.
      await store.linkMembership(m.id, existing.id, existing.password_hash);
      await setRowPassword(m.id, existing.password_hash);
      return { kind: "has_account", membership: m };
    }
    // An account nobody has set a password for yet is set up by this link, like a first setup.
    account =
      existing ??
      (await store.createAccount({ email: m.email, whatsapp: m.whatsapp, name: m.name, password_hash: null }));
    await store.linkMembership(m.id, account.id);
  }
  await setRowPassword(m.id, passwordHash); // clears this row's link
  await store.setAccountPassword(account.id, passwordHash);
  return { kind: "done", account: { ...account, password_hash: passwordHash }, membership: m };
}

/** Session fields the dashboard needs (see PartnerSessionPayload). */
export interface SessionRef {
  accountId?: string;
  influencerId: string;
}

/**
 * Every membership the session may see, oldest first. A session from before P2 (no accountId)
 * still opens all hotels once its row has an account.
 */
export async function membershipsForSession(s: SessionRef, store: AccountStore): Promise<Membership[]> {
  if (await store.ready()) {
    let accountId = s.accountId;
    if (!accountId) {
      const own = await store.getMembership(s.influencerId);
      if (!own) return [];
      if (!own.account_id) return [own];
      accountId = own.account_id;
    }
    return store.listMemberships(accountId);
  }
  const own = await store.getMembership(s.influencerId);
  return own ? [own] : [];
}

/**
 * An existing account for a partner a hotel is adding: by email; else by WhatsApp when exactly
 * one account has that number and no different email was given.
 */
export async function findExistingAccount(
  email: string | null,
  whatsapp: string | null,
  store: AccountStore
): Promise<PartnerAccount | null> {
  if (email) {
    const a = await store.findAccountByEmail(email);
    if (a) return a;
    // A row created before the SQL ran (no account yet) still counts as this person.
    const rows = (await store.findMembershipsByEmail(email)).filter((m) => !m.account_id);
    if (rows[0]) return ensureAccount(rows[0], store);
  }
  if (whatsapp) {
    const matches = (await store.findAccountsByWhatsapp(whatsapp)).filter((a) => !email || !a.email);
    if (matches.length === 1) return matches[0];
  }
  return null;
}
