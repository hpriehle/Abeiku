import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin/auth";
import { getHotelById, updateHotel, getOAuthToken } from "@/lib/db";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const hotel = await getHotelById(session.hotelId);
  if (!hotel) return NextResponse.json({ error: "Hotel not found" }, { status: 404 });

  const oauthToken = await getOAuthToken(session.hotelId, "google");

  return NextResponse.json({
    hotel: {
      ...hotel,
      // Mask sensitive fields
      whatsapp_access_token: hotel.whatsapp_access_token ? "***configured***" : null,
      stripe_secret_key: undefined,
      stripe_webhook_secret: undefined,
    },
    integrations: {
      google_calendar: !!oauthToken,
      whatsapp: !!hotel.whatsapp_access_token,
      momo_payout: hotel.momo_phone_verified,
      card_payments: !!hotel.paystack_subaccount_code,
      google_reviews: !!hotel.google_place_id,
    },
  });
}

const ALLOWED_FIELDS = [
  "contact_phone", "contact_email", "location_lat", "location_lng",
  "location_city", "location_country", "check_in_time", "check_out_time",
  "wifi_password", "currency", "greeting_message", "name",
  "whatsapp_access_token", "whatsapp_phone_number_id", "whatsapp_verify_token",
  "whatsapp_display_phone", "google_place_id",
];

async function fetchWhatsAppDisplayPhone(
  phoneNumberId: string,
  accessToken: string,
): Promise<string | null> {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${phoneNumberId}?fields=display_phone_number`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.display_phone_number || null;
  } catch {
    return null;
  }
}

export async function PATCH(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const updates: Record<string, unknown> = {};
    for (const key of ALLOWED_FIELDS) {
      if (key in body) updates[key] = body[key];
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const hotel = await updateHotel(session.hotelId, updates);

    // When WhatsApp credentials are saved, fetch the display phone number from Meta
    if (updates.whatsapp_phone_number_id && updates.whatsapp_access_token) {
      const displayPhone = await fetchWhatsAppDisplayPhone(
        updates.whatsapp_phone_number_id as string,
        updates.whatsapp_access_token as string,
      );
      if (displayPhone) {
        await updateHotel(session.hotelId, { whatsapp_display_phone: displayPhone });
      }
    }

    return NextResponse.json({ success: true, hotel });
  } catch (error) {
    console.error("Update hotel error:", error);
    return NextResponse.json({ error: "Failed to update hotel" }, { status: 500 });
  }
}
