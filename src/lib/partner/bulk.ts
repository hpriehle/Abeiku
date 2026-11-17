// Admin API logic: bulk create/update partners and list them. Storage is injected
// (see supabasePartnerAdminStore in lib/db/influencers.ts) so this is testable.
// Sends no email or messages: it only returns links for the caller to deliver.

import { randomBytes } from "crypto";
import { isAuthorized } from "./booking-report";
import {
  PARTNER_TYPES,
  currencyForCountry,
  defaultRule,
  isValidRefCode,
  normalizeRefCode,
  todayInGhana,
  totalsFor,
  type BookingStatus,
  type CommissionKind,
  type PartnerCurrency,
  type PartnerType,
  type PayoutStatus,
  type Totals,
} from "./commission";
import { codeFromName, dedupeCode, normalizeEmail, normalizeWhatsapp } from "./codes";
import { inviteStillValid, partnerLink, partnerSiteUrl, setupUrl } from "./views";

export const MAX_BULK_ITEMS = 200;

export interface PartnerRecord {
  id: string;
  hotel_id: string;
  slug: string;
  name: string;
  email: string | null;
  whatsapp: string | null;
  town: string | null;
  ghl_contact_id: string | null;
  partner_type: PartnerType;
  country: string;
  currency: PartnerCurrency;
  commission_kind: CommissionKind;
  commission_value: number;
  commission_currency: PartnerCurrency;
  password_hash: string | null;
  invite_token: string | null;
  invite_expires_at: string | null;
}

export type NewPartnerRow = Omit<PartnerRecord, "id" | "password_hash">;
export type PartnerPatch = Partial<Omit<PartnerRecord, "id" | "hotel_id" | "password_hash">>;

export interface PartnerBookingRow {
  influencer_id: string | null;
  status: BookingStatus;
  check_out: string | null;
  payout_status: PayoutStatus;
  commission_amount: number;
}

export interface PartnerAdminStore {
  findHotelId(slug: string): Promise<string | null>;
  listPartners(hotelId: string): Promise<PartnerRecord[]>;
  /** Partner with this email in any hotel (email is globally unique). */
  findByEmail(email: string): Promise<{ id: string; hotel_id: string } | null>;
  insertPartner(row: NewPartnerRow): Promise<PartnerRecord>;
  updatePartner(id: string, patch: PartnerPatch): Promise<PartnerRecord>;
  listBookings(hotelId: string): Promise<PartnerBookingRow[]>;
}

export interface HandlerResult {
  status: number;
  body: unknown;
}

// ── Validation ──────────────────────────────────────────────────────────

export interface RuleInput {
  kind: CommissionKind;
  value: number;
}

export interface BulkItem {
  name: string;
  type: PartnerType;
  town: string | null;
  whatsapp: string | null;
  email: string | null;
  country: string;
  code: string | null;
  rule: RuleInput | null;
  ghl_contact_id: string | null;
}

function optString(v: unknown, field: string, errors: string[], max = 200): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") {
    errors.push(`${field} must be a string`);
    return null;
  }
  const s = v.trim();
  if (s.length > max) errors.push(`${field} is longer than ${max} characters`);
  return s || null;
}

function parseRule(v: unknown, errors: string[]): RuleInput | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== "object") {
    errors.push('rule must be {"kind": "percent"|"per_night", "value": number}');
    return null;
  }
  const r = v as Record<string, unknown>;
  const kind = r.kind;
  const value = typeof r.value === "string" ? Number(r.value) : r.value;
  if (kind !== "percent" && kind !== "per_night") {
    errors.push("rule.kind must be percent or per_night");
    return null;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    errors.push("rule.value must be a number more than 0");
    return null;
  }
  if (kind === "percent" && value > 100) {
    errors.push("rule.value must be 100 or less for percent");
    return null;
  }
  return { kind, value: Math.round(value * 100) / 100 };
}

export function parseBulkItem(raw: unknown): { ok: true; item: BulkItem } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "item must be an object" };
  const r = raw as Record<string, unknown>;
  const errors: string[] = [];

  const name = optString(r.name, "name", errors, 120);
  if (!name) errors.push("name is required");

  const type = (typeof r.type === "string" ? r.type.trim().toLowerCase() : "") as PartnerType;
  if (!PARTNER_TYPES.includes(type)) errors.push("type must be agency, local or influencer");

  const country = optString(r.country, "country", errors, 80);
  if (!country) errors.push("country is required");

  const town = optString(r.town, "town", errors, 120);
  const ghl_contact_id = optString(r.ghl_contact_id, "ghl_contact_id", errors, 120);

  const rawWhatsapp = optString(r.whatsapp, "whatsapp", errors, 40);
  const whatsapp = rawWhatsapp ? normalizeWhatsapp(rawWhatsapp) : null;
  if (rawWhatsapp && !whatsapp) errors.push("whatsapp must be an international number like +233241234567");

  const rawEmail = optString(r.email, "email", errors, 200);
  const email = rawEmail ? normalizeEmail(rawEmail) : null;
  if (rawEmail && !email) errors.push("email is not valid");

  if (!rawWhatsapp && !rawEmail) errors.push("whatsapp or email is required");

  const rawCode = optString(r.code, "code", errors, 40);
  const code = rawCode ? normalizeRefCode(rawCode) : null;
  if (code && !isValidRefCode(code)) errors.push("code must be 2-40 letters, numbers or hyphens");

  const rule = parseRule(r.rule, errors);

  if (errors.length) return { ok: false, error: errors.join("; ") };
  return {
    ok: true,
    item: { name: name!, type, town, whatsapp, email, country: country!, code, rule, ghl_contact_id },
  };
}

// ── Bulk upsert ─────────────────────────────────────────────────────────

export interface BulkResult {
  name: string | null;
  code: string | null;
  ref_link: string | null;
  setup_link: string | null;
  status: "created" | "updated" | "error";
  error?: string;
}

export interface Ctx {
  hotelId: string;
  siteUrl: string | null;
  partners: PartnerRecord[];
  store: PartnerAdminStore;
  now: Date;
  newToken: () => string;
}

/**
 * Keeps a still-valid invite token; issues a new one (no expiry) only if missing or expired.
 * Null once set up.
 */
export function inviteFor(
  p: Pick<PartnerRecord, "password_hash" | "invite_token" | "invite_expires_at">,
  ctx: Pick<Ctx, "now" | "newToken">
): { link: string | null; patch: { invite_token?: string; invite_expires_at?: null } } {
  if (p.password_hash) return { link: null, patch: {} };
  if (inviteStillValid(p, ctx.now)) return { link: setupUrl(p.invite_token!), patch: {} };
  const invite_token = ctx.newToken();
  return { link: setupUrl(invite_token), patch: { invite_token, invite_expires_at: null } };
}

function errorResult(name: string | null, error: string, code: string | null = null): BulkResult {
  return { name, code, ref_link: null, setup_link: null, status: "error", error };
}

async function emailTakenElsewhere(email: string, selfId: string | null, ctx: Ctx): Promise<boolean> {
  const hit = await ctx.store.findByEmail(email);
  return Boolean(hit && hit.id !== selfId);
}

export type CreateOutcome =
  | { ok: true; partner: PartnerRecord; link: string | null }
  | { ok: false; error: string; conflict: boolean };

/** Creates a new partner in ctx.hotelId (code from the name unless given, default rule by type). */
export async function createPartner(item: BulkItem, ctx: Ctx): Promise<CreateOutcome> {
  if (item.email && (await emailTakenElsewhere(item.email, null, ctx))) {
    return { ok: false, error: "email is already used by a partner of another hotel", conflict: true };
  }
  const currency = currencyForCountry(item.country);
  const taken = ctx.partners.map((p) => p.slug);
  let code: string;
  if (item.code) {
    if (taken.includes(item.code)) return { ok: false, error: `code "${item.code}" is already in use`, conflict: true };
    code = item.code;
  } else {
    code = dedupeCode(codeFromName(item.name), taken);
  }
  const rule = item.rule ?? defaultRule(item.type, currency);
  if (!rule) {
    return {
      ok: false,
      error: `rule is required for type ${item.type}${currency === "USD" ? " outside Ghana" : ""} (no default)`,
      conflict: false,
    };
  }
  const invite = inviteFor({ password_hash: null, invite_token: null, invite_expires_at: null }, ctx);
  const created = await ctx.store.insertPartner({
    hotel_id: ctx.hotelId,
    slug: code,
    name: item.name,
    email: item.email,
    whatsapp: item.whatsapp,
    town: item.town,
    ghl_contact_id: item.ghl_contact_id,
    partner_type: item.type,
    country: item.country,
    currency,
    commission_kind: rule.kind,
    commission_value: rule.value,
    commission_currency: currency,
    invite_token: invite.patch.invite_token ?? null,
    invite_expires_at: null,
  });
  ctx.partners.push(created);
  return { ok: true, partner: created, link: invite.link };
}

async function upsertOne(item: BulkItem, ctx: Ctx): Promise<BulkResult> {
  const byWhatsapp = item.whatsapp ? ctx.partners.find((p) => p.whatsapp === item.whatsapp) : undefined;
  const byEmail = item.email ? ctx.partners.find((p) => p.email === item.email) : undefined;
  if (byWhatsapp && byEmail && byWhatsapp.id !== byEmail.id) {
    return errorResult(
      item.name,
      `whatsapp belongs to partner "${byWhatsapp.slug}" but email belongs to partner "${byEmail.slug}"`
    );
  }
  const existing = byWhatsapp ?? byEmail;
  const currency = currencyForCountry(item.country);

  if (!existing) {
    const made = await createPartner(item, ctx);
    if (!made.ok) return errorResult(item.name, made.error);
    const created = made.partner;
    return { name: created.name, code: created.slug, ref_link: partnerLink(created.slug, ctx.siteUrl), setup_link: made.link, status: "created" };
  }

  if (item.email && item.email !== existing.email && (await emailTakenElsewhere(item.email, existing.id, ctx))) {
    return errorResult(item.name, "email is already used by a partner of another hotel");
  }

  // Update. The ref code never changes here: links may already be out.
  if (item.code && item.code !== existing.slug) {
    return errorResult(item.name, `code cannot be changed (current code is "${existing.slug}")`, existing.slug);
  }
  let rule: RuleInput | null = item.rule;
  if (!rule) {
    const sameBasis = item.type === existing.partner_type && currency === existing.currency;
    rule = sameBasis
      ? { kind: existing.commission_kind, value: Number(existing.commission_value) }
      : defaultRule(item.type, currency);
  }
  if (!rule) {
    return errorResult(
      item.name,
      `rule is required for type ${item.type}${currency === "USD" ? " outside Ghana" : ""} (no default)`,
      existing.slug
    );
  }
  const invite = inviteFor(existing, ctx);
  const patch: PartnerPatch = {
    name: item.name,
    partner_type: item.type,
    country: item.country,
    currency,
    commission_kind: rule.kind,
    commission_value: rule.value,
    commission_currency: currency,
    ...(item.whatsapp ? { whatsapp: item.whatsapp } : {}),
    ...(item.email ? { email: item.email } : {}),
    ...(item.town ? { town: item.town } : {}),
    ...(item.ghl_contact_id ? { ghl_contact_id: item.ghl_contact_id } : {}),
    ...invite.patch,
  };
  const updated = await ctx.store.updatePartner(existing.id, patch);
  ctx.partners[ctx.partners.indexOf(existing)] = updated;
  return { name: updated.name, code: updated.slug, ref_link: partnerLink(updated.slug, ctx.siteUrl), setup_link: invite.link, status: "updated" };
}

export function dbErrorMessage(err: unknown): string {
  const e = err as { code?: string; message?: string };
  if (e?.code === "23505") return "conflicts with an existing partner (duplicate code, email or whatsapp)";
  if (e?.code === "23514") return "rejected by a database check";
  return "could not be saved";
}

export async function handleBulkUpsert(input: {
  authHeader: string | null;
  secret: string | undefined;
  body: unknown;
  store: PartnerAdminStore;
  now?: Date;
  newToken?: () => string;
}): Promise<HandlerResult> {
  if (!isAuthorized(input.authHeader, input.secret)) {
    return { status: 401, body: { error: "Unauthorized" } };
  }
  const body = input.body as { hotel_slug?: unknown; partners?: unknown } | null;
  if (!body || typeof body !== "object" || typeof body.hotel_slug !== "string" || !body.hotel_slug.trim()) {
    return { status: 400, body: { error: "hotel_slug is required" } };
  }
  if (!Array.isArray(body.partners) || body.partners.length === 0) {
    return { status: 400, body: { error: "partners must be a non-empty array" } };
  }
  if (body.partners.length > MAX_BULK_ITEMS) {
    return { status: 400, body: { error: `at most ${MAX_BULK_ITEMS} partners per call` } };
  }

  const hotelId = await input.store.findHotelId(body.hotel_slug.trim());
  if (!hotelId) return { status: 404, body: { error: "Unknown hotel" } };

  const ctx: Ctx = {
    hotelId,
    siteUrl: partnerSiteUrl(body.hotel_slug.trim()),
    partners: await input.store.listPartners(hotelId),
    store: input.store,
    now: input.now ?? new Date(),
    newToken: input.newToken ?? (() => randomBytes(32).toString("hex")),
  };

  // Sequential on purpose: a later item can match a partner created by an earlier one,
  // and generated codes must not collide within the batch.
  const results: BulkResult[] = [];
  for (const raw of body.partners) {
    const parsed = parseBulkItem(raw);
    if (!parsed.ok) {
      const name = raw && typeof (raw as { name?: unknown }).name === "string" ? (raw as { name: string }).name : null;
      results.push(errorResult(name, parsed.error));
      continue;
    }
    try {
      results.push(await upsertOne(parsed.item, ctx));
    } catch (err) {
      console.error("Bulk partner upsert failed for one item", err);
      results.push(errorResult(parsed.item.name, dbErrorMessage(err)));
    }
  }

  const counts = { created: 0, updated: 0, error: 0 };
  for (const r of results) counts[r.status]++;
  return { status: 200, body: { hotel_slug: body.hotel_slug.trim(), counts, results } };
}

// ── List ────────────────────────────────────────────────────────────────

export interface PartnerListItem {
  id: string;
  name: string;
  code: string;
  ref_link: string | null;
  /** Only while the partner has not set a password and the link is still valid. */
  setup_link: string | null;
  /** Null for a link that is valid until used (and when there is no link). */
  setup_expires_at: string | null;
  set_up: boolean;
  whatsapp: string | null;
  email: string | null;
  town: string | null;
  type: PartnerType;
  country: string;
  currency: PartnerCurrency;
  rule: RuleInput;
  ghl_contact_id: string | null;
  bookings: number;
  totals: Totals;
}

export async function handleListPartners(input: {
  authHeader: string | null;
  secret: string | undefined;
  hotelSlug: string | null;
  store: PartnerAdminStore;
  now?: Date;
}): Promise<HandlerResult> {
  if (!isAuthorized(input.authHeader, input.secret)) {
    return { status: 401, body: { error: "Unauthorized" } };
  }
  const slug = (input.hotelSlug ?? "").trim();
  if (!slug) return { status: 400, body: { error: "hotel_slug is required" } };
  const hotelId = await input.store.findHotelId(slug);
  if (!hotelId) return { status: 404, body: { error: "Unknown hotel" } };

  const siteUrl = partnerSiteUrl(slug);
  const now = input.now ?? new Date();
  const today = todayInGhana(now);
  const [partners, bookings] = await Promise.all([
    input.store.listPartners(hotelId),
    input.store.listBookings(hotelId),
  ]);
  const byPartner = new Map<string, PartnerBookingRow[]>();
  for (const b of bookings) {
    if (!b.influencer_id) continue;
    byPartner.set(b.influencer_id, [...(byPartner.get(b.influencer_id) ?? []), b]);
  }

  const items: PartnerListItem[] = partners.map((p) => {
    const rows = byPartner.get(p.id) ?? [];
    const linkValid = inviteStillValid(p, now);
    return {
      id: p.id,
      name: p.name,
      code: p.slug,
      ref_link: partnerLink(p.slug, siteUrl),
      setup_link: linkValid ? setupUrl(p.invite_token!) : null,
      setup_expires_at: linkValid ? p.invite_expires_at : null,
      set_up: Boolean(p.password_hash),
      whatsapp: p.whatsapp,
      email: p.email,
      town: p.town,
      type: p.partner_type,
      country: p.country,
      currency: p.currency,
      rule: { kind: p.commission_kind, value: Number(p.commission_value) },
      ghl_contact_id: p.ghl_contact_id,
      bookings: rows.length,
      totals: totalsFor(rows.map((r) => ({ ...r, commission_amount: Number(r.commission_amount) })), today),
    };
  });

  return { status: 200, body: { hotel_slug: slug, partners: items } };
}
