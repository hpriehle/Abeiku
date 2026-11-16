// POST /api/admin/billing/cancel: cancel the hotel's plan (in the trial: nothing is charged).

import { NextResponse } from "next/server";
import { billingDeps } from "@/lib/billing";
import { cancelBilling } from "@/lib/billing/flow";
import { errorResponse, requireSession } from "@/lib/billing/route-helpers";

export async function POST() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  try {
    const { accessUntil } = await cancelBilling(billingDeps(), session.hotelId);
    return NextResponse.json({ success: true, accessUntil });
  } catch (err) {
    return errorResponse(err, "cancel");
  }
}
