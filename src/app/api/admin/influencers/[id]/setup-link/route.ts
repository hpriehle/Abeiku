import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getSession } from "@/lib/admin/auth";
import { getInfluencerById, setInfluencerInvite } from "@/lib/db/influencers";
import { INVITE_TTL_MS, setupUrl } from "@/lib/partner/views";

// Issues a fresh setup link for a partner who has not set a password yet. Sends no email.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const partner = await getInfluencerById(id);
  if (!partner || partner.hotel_id !== session.hotelId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (partner.password_hash) {
    return NextResponse.json({ error: "Partner has already set a password" }, { status: 409 });
  }

  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + INVITE_TTL_MS).toISOString();
  await setInfluencerInvite(partner.id, token, expires);
  return NextResponse.json({ setup_url: setupUrl(token), setup_expires_at: expires });
}
