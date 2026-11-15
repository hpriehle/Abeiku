import { NextResponse } from "next/server";
import { getPartnerSession } from "@/lib/partner/auth";
import { getInfluencerById, listBookingsForInfluencer } from "@/lib/db/influencers";
import { todayInGhana, totalsFor } from "@/lib/partner/commission";
import { bookingView, partnerLink, partnerSiteUrl } from "@/lib/partner/views";

export async function GET() {
  const session = await getPartnerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const partner = await getInfluencerById(session.influencerId);
  if (!partner) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const rows = await listBookingsForInfluencer(partner.id);
  const today = todayInGhana();

  return NextResponse.json({
    name: partner.name,
    email: partner.email,
    code: partner.slug,
    // Null when the hotel has no partner site yet; the dashboard says so instead of a wrong link.
    link_url: partnerLink(partner.slug, partnerSiteUrl(session.hotelSlug)),
    currency: partner.currency,
    commission_kind: partner.commission_kind,
    commission_value: Number(partner.commission_value),
    totals: totalsFor(rows.map((r) => ({ ...r, commission_amount: Number(r.commission_amount) })), today),
    // Partners see dates, nights, status and their commission; not guest amounts.
    bookings: rows.map((r) => {
      const v = bookingView(r, null, today);
      return {
        id: v.id,
        booking_ref: v.booking_ref,
        check_in: v.check_in,
        check_out: v.check_out,
        nights: v.nights,
        status: v.status,
        commission: v.commission,
        payout_paid_at: v.payout_paid_at,
      };
    }),
  });
}
