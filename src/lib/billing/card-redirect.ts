// Redirect for GET /api/admin/billing/card (kept here: route files may only export handlers).

import { NextResponse } from "next/server";
import { SITE_URL } from "@/lib/site";
import { BillingError, cardUpdateUrl, type BillingDeps } from "./flow";

/** To the provider's card page; to login without a session; back to /admin/plan?card=error on failure. */
export async function cardRedirect(hotelId: string | null, deps: BillingDeps, base = SITE_URL): Promise<NextResponse> {
  if (!hotelId) return NextResponse.redirect(new URL("/admin/login", base), 303);
  try {
    return NextResponse.redirect(await cardUpdateUrl(deps, hotelId), 303);
  } catch (err) {
    if (!(err instanceof BillingError) || err.status >= 500) console.error("[billing] card link failed:", err);
    return NextResponse.redirect(new URL("/admin/plan?card=error", base), 303);
  }
}
