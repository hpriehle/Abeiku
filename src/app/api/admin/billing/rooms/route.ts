// POST /api/admin/billing/rooms { rooms }: new room count; a new tier starts with the next charge.

import { NextRequest, NextResponse } from "next/server";
import { billingDeps } from "@/lib/billing";
import { changeRoomCount } from "@/lib/billing/flow";
import { parseRoomCount } from "@/lib/billing/plans";
import { errorResponse, requireSession } from "@/lib/billing/route-helpers";

export async function POST(request: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  try {
    const body = (await request.json().catch(() => ({}))) as { rooms?: unknown };
    const rooms = parseRoomCount(body.rooms);
    if (rooms === null) return NextResponse.json({ error: "Enter how many rooms you rent out (1 or more)." }, { status: 400 });
    const result = await changeRoomCount(billingDeps(), session.hotelId, rooms);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return errorResponse(err, "rooms");
  }
}
