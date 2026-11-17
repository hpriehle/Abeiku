import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin/auth";
import { getInfluencerById, listBookingsForInfluencer } from "@/lib/db/influencers";
import { supabasePayoutStore } from "@/lib/db/partner-payouts";
import { handleRecordPayout } from "@/lib/partner/payouts";

// P2 step 5: the hotel records a payout it made to this partner (no money moves through Abeiku).
// Body: { booking_ids: string[], amount: number, currency: "GHS"|"USD", paid_on: "YYYY-MM-DD",
//         method: string, reference?: string }
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const r = await handleRecordPayout({ hotelId: session.hotelId, userId: session.userId }, id, body, {
    payouts: supabasePayoutStore,
    getPartner: getInfluencerById,
    listBookings: listBookingsForInfluencer,
  });
  return NextResponse.json(r.body, { status: r.status });
}
