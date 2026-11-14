import { NextRequest, NextResponse } from "next/server";
import { handleListPartners } from "@/lib/partner/bulk";
import { supabasePartnerAdminStore } from "@/lib/db/influencers";

// Server-to-server: every partner of a hotel with code, links and commission totals.
// Auth: Authorization: Bearer $ABEIKU_ADMIN_API_SECRET. Read-only.
export async function GET(request: NextRequest) {
  try {
    const result = await handleListPartners({
      authHeader: request.headers.get("authorization"),
      secret: process.env.ABEIKU_ADMIN_API_SECRET,
      hotelSlug: request.nextUrl.searchParams.get("hotel_slug"),
      store: supabasePartnerAdminStore,
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    console.error("List partners failed", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
