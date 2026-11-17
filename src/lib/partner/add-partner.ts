// Hotel admin adds a partner (POST /api/admin/influencers, after validation). P2 step 3:
//  - the email / WhatsApp already has an Abeiku partner account → the hotel is added to it right
//    away (no accept step); the partner gets an email, and the hotel gets a WhatsApp tap link;
//  - otherwise → a new partner with a setup link, as before (the setup creates the account).
// Before the P2 SQL runs there are no accounts: always the old flow. I/O is injected.

import type { Influencer } from "@/lib/db/influencers";
import { findExistingAccount, type AccountStore } from "./accounts";
import { codeFromName, dedupeCode } from "./codes";
import { currencyForCountry, type CommissionKind, type PartnerType } from "./commission";
import type { HandlerResult } from "./bulk";
import { ALREADY_YOUR_PARTNER, addedEmail, addedWhatsappText, whatsappTapUrl } from "./p2-copy";
import { partnerLink, partnerLoginUrl, setupUrl } from "./views";

export interface AddPartnerInput {
  name: string;
  email: string | null;
  whatsapp: string | null;
  town: string | null;
  partner_type: PartnerType;
  country: string;
  /** Normalized; "" = issue one from the name. */
  code: string;
  commission_kind: CommissionKind;
  commission_value: number;
}

export interface NewMembership {
  hotel_id: string;
  slug: string;
  name: string;
  email: string | null;
  whatsapp: string | null;
  town: string | null;
  invite_token: string | null;
  invite_expires_at: string | null;
  partner_type: PartnerType;
  country: string;
  currency: Influencer["currency"];
  commission_kind: CommissionKind;
  commission_value: number;
  commission_currency: Influencer["currency"];
  account_id?: string;
  password_hash?: string | null;
}

export interface AddPartnerDeps {
  store: AccountStore;
  hotel: { id: string; name: string };
  siteUrl: string | null;
  getBySlug(hotelId: string, code: string): Promise<Influencer | null>;
  /** Partner with this email in any hotel. */
  getByEmail(email: string): Promise<Influencer | null>;
  getByWhatsapp(hotelId: string, whatsapp: string): Promise<Influencer | null>;
  listCodes(hotelId: string): Promise<string[]>;
  create(row: NewMembership): Promise<Influencer>;
  sendEmail(msg: { to: string; subject: string; html: string; text: string }): Promise<{ success: boolean }>;
  newToken(): string;
}

function partnerOut(p: Influencer) {
  return { id: p.id, code: p.slug, name: p.name, email: p.email, whatsapp: p.whatsapp, currency: p.currency };
}

export async function handleAddPartner(input: AddPartnerInput, deps: AddPartnerDeps): Promise<HandlerResult> {
  const hotelId = deps.hotel.id;
  const currency = currencyForCountry(input.country);
  const value = Math.round(input.commission_value * 100) / 100;
  const base = {
    hotel_id: hotelId,
    name: input.name,
    town: input.town,
    invite_expires_at: null, // a setup link is valid until used
    partner_type: input.partner_type,
    country: input.country,
    currency,
    commission_kind: input.commission_kind,
    commission_value: value,
    commission_currency: currency,
  };
  const pickCode = async () =>
    input.code || dedupeCode(codeFromName(input.name), await deps.listCodes(hotelId));

  const account = (await deps.store.ready())
    ? await findExistingAccount(input.email, input.whatsapp, deps.store)
    : null;

  if (account) {
    const memberships = await deps.store.listMemberships(account.id);
    if (memberships.some((m) => m.hotel_id === hotelId)) {
      return { status: 409, body: { error: ALREADY_YOUR_PARTNER } };
    }
    const email = account.email ?? input.email;
    const whatsapp = input.whatsapp ?? account.whatsapp;
    const [codeClash, whatsappClash] = await Promise.all([
      input.code ? deps.getBySlug(hotelId, input.code) : null,
      whatsapp ? deps.getByWhatsapp(hotelId, whatsapp) : null,
    ]);
    if (codeClash) return { status: 409, body: { error: "Code already in use" } };
    if (whatsappClash) return { status: 409, body: { error: "WhatsApp number already registered" } };

    // An account nobody has set a password for yet still needs its setup link.
    const token = account.password_hash ? null : deps.newToken();
    const partner = await deps.create({
      ...base,
      slug: await pickCode(),
      email,
      whatsapp,
      invite_token: token,
      account_id: account.id,
      password_hash: account.password_hash,
    });

    let emailed = false;
    let whatsappUrl: string | null = null;
    if (!token) {
      const notice = {
        partnerName: account.name,
        hotelName: deps.hotel.name,
        link: partnerLink(partner.slug, deps.siteUrl),
        loginUrl: partnerLoginUrl(),
      };
      if (account.email) {
        try {
          emailed = (await deps.sendEmail({ to: account.email, ...addedEmail(notice) })).success;
        } catch (err) {
          console.error("Partner added email failed", err);
        }
      }
      if (whatsapp) whatsappUrl = whatsappTapUrl(whatsapp, addedWhatsappText(notice));
    }

    return {
      status: 201,
      body: {
        success: true,
        partner: partnerOut(partner),
        setup_url: token ? setupUrl(token) : null,
        setup_expires_at: null,
        existing_account: true,
        emailed,
        whatsapp_url: whatsappUrl,
      },
    };
  }

  // New partner: as before P2.
  const [codeClash, emailClash, whatsappClash] = await Promise.all([
    input.code ? deps.getBySlug(hotelId, input.code) : null,
    input.email ? deps.getByEmail(input.email) : null,
    input.whatsapp ? deps.getByWhatsapp(hotelId, input.whatsapp) : null,
  ]);
  if (codeClash) return { status: 409, body: { error: "Code already in use" } };
  if (emailClash) return { status: 409, body: { error: "Email already registered" } };
  if (whatsappClash) return { status: 409, body: { error: "WhatsApp number already registered" } };

  const token = deps.newToken();
  const partner = await deps.create({
    ...base,
    slug: await pickCode(),
    email: input.email,
    whatsapp: input.whatsapp,
    invite_token: token,
  });
  return {
    status: 201,
    body: {
      success: true,
      partner: partnerOut(partner),
      setup_url: setupUrl(token),
      setup_expires_at: null,
      existing_account: false,
    },
  };
}
