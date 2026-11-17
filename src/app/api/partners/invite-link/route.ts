import { NextRequest, NextResponse } from "next/server";
import { handleInviteLink } from "@/lib/partner/invite-link";
import { supabasePartnerAdminStore } from "@/lib/db/influencers";

// Server-to-server (Siteboard): a partner's setup link, or login URL once set up. Finds the
// partner in the hotel by WhatsApp, then email; creates one if none.
// Auth: Authorization: Bearer $ABEIKU_PARTNER_API_KEY (unset = 503 for every call).
// Sends no email or messages. See docs/partner-tracking.md.
export async function POST(request: NextRequest) {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null; // auth is still checked first, then the body fails validation (400)
  }
  try {
    const result = await handleInviteLink({
      authHeader: request.headers.get("authorization"),
      secret: process.env.ABEIKU_PARTNER_API_KEY,
      body,
      store: supabasePartnerAdminStore,
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    console.error("Partner invite link failed", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
