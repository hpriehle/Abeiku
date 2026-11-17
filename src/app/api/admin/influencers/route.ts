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
import { normalizeEmail, normalizeWhatsapp } from "@/lib/partner/codes";
import { getHotelById } from "@/lib/db";
import { supabaseAccountStore } from "@/lib/db/partner-accounts";
import { sendEmail } from "@/lib/notifications/email";
import { handleAddPartner } from "@/lib/partner/add-partner";
import {
  PARTNER_TYPES,
  isValidRefCode,
  normalizeRefCode,
  type CommissionKind,
  type PartnerType,
} from "@/lib/partner/commission";
import { adminSiteUrl, buildAdminView, partnerSiteUrl } from "@/lib/partner/views";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [partners, bookings] = await Promise.all([
    listInfluencersForHotel(session.hotelId),
    listBookingsForHotel(session.hotelId),
  ]);
  return NextResponse.json(buildAdminView(partners, bookings, await adminSiteUrl(session.hotelId)));
}

// Adds a partner. New partner: returns the setup link for the admin to copy (no email sent).
// Existing Abeiku partner account (P2): added right away, the partner is emailed, and the admin gets
// a WhatsApp tap link to send.
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

    const hotel = await getHotelById(session.hotelId);
    if (!hotel) return NextResponse.json({ error: "Hotel not found" }, { status: 404 });

    // Existing Abeiku partner account → added right away and told by email; else a setup link.
    const result = await handleAddPartner(
      {
        name,
        email,
        whatsapp,
        town,
        partner_type,
        country,
        code: givenCode,
        commission_kind,
        commission_value,
      },
      {
        store: supabaseAccountStore,
        hotel: { id: hotel.id, name: hotel.name },
        siteUrl: partnerSiteUrl(hotel.slug),
        getBySlug: getInfluencerBySlug,
        getByEmail: getInfluencerByEmail,
        getByWhatsapp: getInfluencerByWhatsapp,
        listCodes: async (hotelId) => (await listInfluencersForHotel(hotelId)).map((p) => p.slug),
        create: createInfluencer,
        sendEmail,
        newToken: () => randomBytes(32).toString("hex"),
      }
    );
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    console.error("Create partner error:", err);
    return NextResponse.json({ error: "Failed to create partner" }, { status: 500 });
  }
}
