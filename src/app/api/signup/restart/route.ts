// POST /api/signup/restart: "Start again" after a cancelled plan ended. Back to the card step,
// with no second free trial (the first charge is when the card is added).

import { NextResponse } from "next/server";
import { billingDeps } from "@/lib/billing";
import { restartBilling } from "@/lib/billing/flow";
import { errorResponse, requireSession } from "@/lib/billing/route-helpers";

export async function POST() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  try {
    await restartBilling(billingDeps(), session.hotelId);
    return NextResponse.json({ success: true });
  } catch (err) {
    return errorResponse(err, "restart");
  }
}
