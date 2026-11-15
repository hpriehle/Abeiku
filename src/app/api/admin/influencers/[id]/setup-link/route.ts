import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getSession } from "@/lib/admin/auth";
import { getInfluencerById, setInfluencerInvite, setInfluencerResetInvite } from "@/lib/db/influencers";
import { INVITE_TTL_MS, RESET_TTL_MS, setupUrl } from "@/lib/partner/views";

// Issues a fresh setup link. Sends no email: the admin copies it into a message.
// For a partner who already has a password this is a password reset (shorter expiry); their
// current password keeps working until they use the link.
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
  const expires = new Date(Date.now() + (reset ? RESET_TTL_MS : INVITE_TTL_MS)).toISOString();
  if (reset) await setInfluencerResetInvite(partner.id, token, expires);
  else await setInfluencerInvite(partner.id, token, expires);
  return NextResponse.json({ setup_url: setupUrl(token), setup_expires_at: expires, reset });
}
