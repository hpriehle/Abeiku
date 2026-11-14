import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin/auth";
import { getBookingById, setBookingPayout } from "@/lib/db/influencers";
import { displayStatus } from "@/lib/partner/commission";

// Records a manual payout (e.g. MoMo sent by hand) for one booking, or undoes it.
// Body: { paid: true, paid_at: "YYYY-MM-DD", note?: string } | { paid: false }
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const booking = await getBookingById(id);
  if (!booking || booking.hotel_id !== session.hotelId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: { paid?: unknown; paid_at?: unknown; note?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.paid === false) {
    await setBookingPayout(id, { paid: false });
    return NextResponse.json({ ok: true });
  }

  const paidAt = typeof body.paid_at === "string" ? body.paid_at : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidAt) || Number.isNaN(Date.parse(paidAt))) {
    return NextResponse.json({ error: "paid_at must be a date (YYYY-MM-DD)" }, { status: 400 });
  }
  if (!booking.influencer_id) {
    return NextResponse.json({ error: "Booking has no partner" }, { status: 400 });
  }
  if (displayStatus(booking) !== "owed") {
    return NextResponse.json({ error: "Only owed bookings can be marked paid" }, { status: 409 });
  }

  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 500) : null;
  await setBookingPayout(id, { paid: true, paid_at: paidAt, note });
  return NextResponse.json({ ok: true });
}
