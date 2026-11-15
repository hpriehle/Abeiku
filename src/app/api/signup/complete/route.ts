// POST /api/signup/complete { provider, reference | sessionId }: after the card page.
// Finishes billing, then re-issues the session without the billing block.

import { NextRequest, NextResponse } from "next/server";
import { billingDeps } from "@/lib/billing";
import { billingView } from "@/lib/billing/access";
import { completePaystackSetup, completeStripeSetup } from "@/lib/billing/flow";
import { errorResponse, requireSession } from "@/lib/billing/route-helpers";
import { setAdminSession } from "@/lib/billing/session";

export async function POST(request: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const deps = billingDeps();
    const ref = typeof body.reference === "string" ? body.reference : typeof body.sessionId === "string" ? body.sessionId : "";
    if (!ref || ref.length > 200) return NextResponse.json({ error: "Missing payment reference." }, { status: 400 });

    const result =
      body.provider === "paystack"
        ? await completePaystackSetup(deps, session.hotelId, ref)
        : body.provider === "stripe"
          ? await completeStripeSetup(deps, session.hotelId, ref)
          : null;
    if (!result) return NextResponse.json({ error: "Unknown payment provider." }, { status: 400 });

    const hotel = await deps.store.getHotel(session.hotelId);
    const view = billingView(hotel ?? {});
    const res = NextResponse.json({ success: true, trialEndsAt: result.trialEndsAt, access: view.access });
    return setAdminSession(res, { userId: session.userId, hotelId: session.hotelId, email: session.email, hotelName: session.hotelName, role: session.role }, view);
  } catch (err) {
    return errorResponse(err, "complete");
  }
}
