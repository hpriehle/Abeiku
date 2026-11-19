// GET /api/admin/billing/card: send the owner to change their card (and cancel, if they want).
// Stripe: a Billing Portal session for the hotel's customer. Paystack: the hosted "manage
// subscription" page (GET /subscription/:code/manage/link). On failure: back to the Plan page
// with ?card=error so it can say so.

import { billingDeps } from "@/lib/billing";
import { cardRedirect } from "@/lib/billing/card-redirect";
import { getSession } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  return cardRedirect(session?.hotelId ?? null, billingDeps());
}
