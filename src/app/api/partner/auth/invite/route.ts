import { NextRequest, NextResponse } from "next/server";
import { getInfluencerByInviteToken } from "@/lib/db/influencers";
import { checkInvite } from "@/lib/partner/invite";

// Read-only: lets the setup page say up front whether the link still works.
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token")?.trim() ?? "";
  try {
    const partner = token ? await getInfluencerByInviteToken(token) : null;
    return NextResponse.json(checkInvite(token, partner), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("Invite check error:", err);
    return NextResponse.json({ error: "Could not check the link" }, { status: 500 });
  }
}
