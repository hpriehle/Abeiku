import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getSession } from "@/lib/admin/auth";
import { getInfluencerById, setInfluencerInvite, setInfluencerResetInvite } from "@/lib/db/influencers";
import { RESET_TTL_MS, setupUrl } from "@/lib/partner/views";

// Issues a fresh setup link. Sends no email: the admin copies it into a message.
// A first setup link is valid until used (no expiry). For a partner who already has a password
// this is a password reset (3-day expiry); their current password keeps working until they use it.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const partner = await getInfluencerById(id);
  if (!partner || partner.hotel_id !== session.hotelId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const reset = Boolean(partner.password_hash);
  const token = randomBytes(32).toString("hex");
  let expires: string | null = null;
  if (reset) {
    expires = new Date(Date.now() + RESET_TTL_MS).toISOString();
    await setInfluencerResetInvite(partner.id, token, expires);
  } else {
    await setInfluencerInvite(partner.id, token, null);
  }
  return NextResponse.json({ setup_url: setupUrl(token), setup_expires_at: expires, reset });
}
