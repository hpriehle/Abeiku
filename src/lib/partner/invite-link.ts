// POST /api/partners/invite-link logic: hand another system (Siteboard) a partner's setup link.
// Finds the partner in the hotel by WhatsApp, then email; creates one if none. A partner who
// already set a password gets the login URL instead. Sends no email or messages.

import { randomBytes } from "crypto";
import { isAuthorized } from "./booking-report";
import { createPartner, dbErrorMessage, inviteFor, parseBulkItem, type Ctx, type HandlerResult, type PartnerAdminStore, type PartnerRecord } from "./bulk";
import { partnerLink, partnerLoginUrl, partnerSiteUrl, setupUrl } from "./views";

/** New partners default to a local partner in Ghana (GH₵150/night), like a manual "local" add. */
export const DEFAULT_TYPE = "local";
export const DEFAULT_COUNTRY = "Ghana";

export interface InviteLinkResponse {
  partnerId: string;
  status: "setup" | "active";
  /** Setup link while the partner has no password, else the partner login URL. */
  url: string;
  /** The partner's referral link on the hotel site; null if the hotel has no site set up. */
  partnerLink: string | null;
  code: string;
  created: boolean;
  type: PartnerRecord["partner_type"];
  commission: { kind: PartnerRecord["commission_kind"]; value: number; currency: PartnerRecord["commission_currency"] };
}

function response(p: PartnerRecord, created: boolean, url: string, siteUrl: string | null): InviteLinkResponse {
  return {
    partnerId: p.id,
    status: p.password_hash ? "active" : "setup",
    url,
    partnerLink: partnerLink(p.slug, siteUrl),
    code: p.slug,
    created,
    type: p.partner_type,
    commission: { kind: p.commission_kind, value: Number(p.commission_value), currency: p.commission_currency },
  };
}

export async function handleInviteLink(input: {
  authHeader: string | null;
  secret: string | undefined;
  body: unknown;
  store: PartnerAdminStore;
  now?: Date;
  newToken?: () => string;
}): Promise<HandlerResult> {
  if (!input.secret) return { status: 503, body: { error: "Partner API is not configured" } };
  if (!isAuthorized(input.authHeader, input.secret)) return { status: 401, body: { error: "Unauthorized" } };

  const body = input.body as Record<string, unknown> | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { status: 400, body: { error: "body must be a JSON object" } };
  }
  const hotel = typeof body.hotel === "string" ? body.hotel.trim().toLowerCase() : "";
  if (!hotel) return { status: 400, body: { error: "hotel is required" } };

  const parsed = parseBulkItem({
    name: body.name,
    whatsapp: body.whatsapp,
    email: body.email,
    town: body.town,
    rule: body.rule,
    type: body.type ?? DEFAULT_TYPE,
    country: body.country ?? DEFAULT_COUNTRY,
  });
  if (!parsed.ok) return { status: 400, body: { error: parsed.error } };
  const item = parsed.item;

  const hotelId = await input.store.findHotelId(hotel);
  if (!hotelId) return { status: 404, body: { error: "Unknown hotel" } };

  const siteUrl = partnerSiteUrl(hotel);
  const ctx: Ctx = {
    hotelId,
    siteUrl,
    partners: await input.store.listPartners(hotelId),
    store: input.store,
    now: input.now ?? new Date(),
    newToken: input.newToken ?? (() => randomBytes(32).toString("hex")),
  };

  // WhatsApp first, then email. A match is not edited: only its setup link may be (re)issued.
  const existing =
    (item.whatsapp ? ctx.partners.find((p) => p.whatsapp === item.whatsapp) : undefined) ??
    (item.email ? ctx.partners.find((p) => p.email === item.email) : undefined);

  if (existing) {
    if (existing.password_hash) {
      return { status: 200, body: response(existing, false, partnerLoginUrl(), siteUrl) };
    }
    const invite = inviteFor(existing, ctx);
    const partner = Object.keys(invite.patch).length
      ? await input.store.updatePartner(existing.id, invite.patch)
      : existing;
    return { status: 200, body: response(partner, false, invite.link ?? setupUrl(partner.invite_token!), siteUrl) };
  }

  try {
    const made = await createPartner({ ...item, code: null, ghl_contact_id: null }, ctx);
    if (!made.ok) return { status: made.conflict ? 409 : 400, body: { error: made.error } };
    return { status: 201, body: response(made.partner, true, made.link!, siteUrl) };
  } catch (err) {
    const e = err as { code?: string };
    if (e?.code === "23505" || e?.code === "23514") {
      return { status: 409, body: { error: dbErrorMessage(err) } };
    }
    throw err;
  }
}
