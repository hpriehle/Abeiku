// POST /api/signup/card { provider: "paystack" | "stripe" }: step 4, returns the card page URL.

import { NextRequest, NextResponse } from "next/server";
import { billingDeps } from "@/lib/billing";
import { startCardSetup } from "@/lib/billing/flow";
import { errorResponse, requireSession } from "@/lib/billing/route-helpers";

export async function POST(request: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  try {
    const body = (await request.json().catch(() => ({}))) as { provider?: unknown };
    if (body.provider !== "paystack" && body.provider !== "stripe") {
      return NextResponse.json({ error: "Choose cedis or dollars." }, { status: 400 });
    }
    const { url } = await startCardSetup(billingDeps(), session.hotelId, body.provider);
    return NextResponse.json({ url });
  } catch (err) {
    return errorResponse(err, "card");
  }
}
