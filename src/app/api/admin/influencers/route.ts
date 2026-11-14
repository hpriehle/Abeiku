import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getSession } from "@/lib/admin/auth";
import {
  createInfluencer,
  listInfluencersForHotel,
  listBookingsForHotel,
  getInfluencerBySlug,
  getInfluencerByEmail,
} from "@/lib/db/influencers";
import {
  PARTNER_TYPES,
  currencyForCountry,
  isValidRefCode,
  normalizeRefCode,
  type CommissionKind,
  type PartnerType,
} from "@/lib/partner/commission";
import { buildAdminView, INVITE_TTL_MS, setupUrl } from "@/lib/partner/views";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [partners, bookings] = await Promise.all([
    listInfluencersForHotel(session.hotelId),
    listBookingsForHotel(session.hotelId),
  ]);
  return NextResponse.json(buildAdminView(partners, bookings));
}

// Creates a partner. Sends no email: returns the setup link for the admin to copy.
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const code = normalizeRefCode(String(body.code ?? ""));
    const name = String(body.name ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const partner_type = String(body.partner_type ?? "") as PartnerType;
    const country = String(body.country ?? "").trim();
    const commission_kind = String(body.commission_kind ?? "") as CommissionKind;
    const commission_value = Number(body.commission_value);

    if (!code || !name || !email || !country) {
      return NextResponse.json({ error: "name, email, country and code are required" }, { status: 400 });
    }
    if (!PARTNER_TYPES.includes(partner_type)) {
      return NextResponse.json({ error: "type must be agency, local or influencer" }, { status: 400 });
    }
    if (!isValidRefCode(code)) {
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

    const [codeClash, emailClash] = await Promise.all([
      getInfluencerBySlug(session.hotelId, code),
      getInfluencerByEmail(email),
    ]);
    if (codeClash) return NextResponse.json({ error: "Code already in use" }, { status: 409 });
    if (emailClash) return NextResponse.json({ error: "Email already registered" }, { status: 409 });

    const currency = currencyForCountry(country);
    const invite_token = randomBytes(32).toString("hex");
    const invite_expires_at = new Date(Date.now() + INVITE_TTL_MS).toISOString();

    const partner = await createInfluencer({
      hotel_id: session.hotelId,
      slug: code,
      name,
      email,
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
        partner: { id: partner.id, code: partner.slug, name: partner.name, email: partner.email, currency },
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
