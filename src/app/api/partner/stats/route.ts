import { NextRequest, NextResponse } from "next/server";
import { getPartnerSession } from "@/lib/partner/auth";
import { getTotalClicks, listBookingsForInfluencer } from "@/lib/db/influencers";
import { supabaseAccountStore } from "@/lib/db/partner-accounts";
import { getHotelById } from "@/lib/db";
import { handlePartnerStats } from "@/lib/partner/dashboard";

// ?hotel=<slug> picks one of the account's hotels (P2); default is the hotel the session opened on.
export async function GET(request: NextRequest) {
  const result = await handlePartnerStats(await getPartnerSession(), request.nextUrl.searchParams.get("hotel"), {
    store: supabaseAccountStore,
    getHotel: async (id) => {
      const h = await getHotelById(id);
      return h ? { id: h.id, slug: h.slug, name: h.name } : null;
    },
    listBookings: listBookingsForInfluencer,
    countClicks: getTotalClicks,
  });
  return NextResponse.json(result.body, { status: result.status });
}
