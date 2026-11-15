import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getSession } from "@/lib/admin/auth";
import {
  createInfluencer,
  listInfluencersForHotel,
  listBookingsForHotel,
  getInfluencerBySlug,
  getInfluencerByEmail,
  getInfluencerByWhatsapp,
} from "@/lib/db/influencers";
import { codeFromName, dedupeCode, normalizeEmail, normalizeWhatsapp } from "@/lib/partner/codes";
import {
  PARTNER_TYPES,
  currencyForCountry,
  isValidRefCode,
  normalizeRefCode,
  type CommissionKind,
  type PartnerType,
} from "@/lib/partner/commission";
import { adminSiteUrl, buildAdminView, INVITE_TTL_MS, setupUrl } from "@/lib/partner/views";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [partners, bookings] = await Promise.all([
    listInfluencersForHotel(session.hotelId),
    listBookingsForHotel(session.hotelId),
  ]);
  return NextResponse.json(buildAdminView(partners, bookings, await adminSiteUrl(session.hotelId)));
}

// Creates a partner. Sends no email: returns the setup link for the admin to copy.
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const name = String(body.name ?? "").trim();
    const rawEmail = String(body.email ?? "").trim();
    const rawWhatsapp = String(body.whatsapp ?? "").trim();
    const town = String(body.town ?? "").trim() || null;
    const partner_type = String(body.partner_type ?? "") as PartnerType;
    const country = String(body.country ?? "").trim();
    const commission_kind = String(body.commission_kind ?? "") as CommissionKind;
    const commission_value = Number(body.commission_value);
    const email = rawEmail ? normalizeEmail(rawEmail) : null;
    const whatsapp = rawWhatsapp ? normalizeWhatsapp(rawWhatsapp) : null;

    if (!name || !country) {
      return NextResponse.json({ error: "name and country are required" }, { status: 400 });
    }
    if (!rawEmail && !rawWhatsapp) {
      return NextResponse.json({ error: "Email or WhatsApp number is required" }, { status: 400 });
    }
    if (rawEmail && !email) return NextResponse.json({ error: "Email is not valid" }, { status: 400 });
    if (rawWhatsapp && !whatsapp) {
      return NextResponse.json(
        { error: "WhatsApp must be an international number, e.g. +233241234567" },
        { status: 400 }
      );
    }
    if (!PARTNER_TYPES.includes(partner_type)) {
      return NextResponse.json({ error: "type must be agency, local or influencer" }, { status: 400 });
    }
    const givenCode = normalizeRefCode(String(body.code ?? ""));
    if (givenCode && !isValidRefCode(givenCode)) {
      return NextResponse.json(
        { error: "Code must be 2-40 chars, letters/numbers/hyphens only" },
        { status: 400 }
      );
    }
    if (commission_kind !== "percent" && commission_kind !== "per_night") {
      return NextResponse.json({ error: "Commission rule is required" }, { status: 400 });
    }
    if (!Number.isFinite(commission_value) || commission_value <= 0) {
      return NextResponse.json({ error: "Commission value must be more than 0" }, { status: 400 });
    }
    if (commission_kind === "percent" && commission_value > 100) {
      return NextResponse.json({ error: "Percent must be 100 or less" }, { status: 400 });
    }

    const [codeClash, emailClash, whatsappClash] = await Promise.all([
      givenCode ? getInfluencerBySlug(session.hotelId, givenCode) : null,
      email ? getInfluencerByEmail(email) : null,
      whatsapp ? getInfluencerByWhatsapp(session.hotelId, whatsapp) : null,
    ]);
    if (codeClash) return NextResponse.json({ error: "Code already in use" }, { status: 409 });
    if (emailClash) return NextResponse.json({ error: "Email already registered" }, { status: 409 });
    if (whatsappClash) {
      return NextResponse.json({ error: "WhatsApp number already registered" }, { status: 409 });
    }

    // No code given: Abeiku issues one from the name (carmen-travels, carmen-travels-2, ...).
    const code =
      givenCode ||
      dedupeCode(
        codeFromName(name),
        (await listInfluencersForHotel(session.hotelId)).map((p) => p.slug)
      );

    const currency = currencyForCountry(country);
    const invite_token = randomBytes(32).toString("hex");
    const invite_expires_at = new Date(Date.now() + INVITE_TTL_MS).toISOString();

    const partner = await createInfluencer({
      hotel_id: session.hotelId,
      slug: code,
      name,
      email,
      whatsapp,
      town,
      invite_token,
      invite_expires_at,
      partner_type,
      country,
      currency,
      commission_kind,
      commission_value: Math.round(commission_value * 100) / 100,
      commission_currency: currency,
    });

    return NextResponse.json(
      {
        success: true,
        partner: { id: partner.id, code: partner.slug, name: partner.name, email: partner.email, whatsapp: partner.whatsapp, currency },
        setup_url: setupUrl(invite_token),
        setup_expires_at: invite_expires_at,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("Create partner error:", err);
    return NextResponse.json({ error: "Failed to create partner" }, { status: 500 });
  }
}
