// Sets the admin session cookie with the right `billing` claim (server only).

import { NextResponse } from "next/server";
import { createSessionToken, getSessionCookieOptions, type SessionPayload } from "@/lib/admin/auth";
import { sessionBillingClaim, type BillingView } from "./access";

export async function setAdminSession(
  res: NextResponse,
  base: Omit<SessionPayload, "billing">,
  view: BillingView
): Promise<NextResponse> {
  const claim = sessionBillingClaim(view);
  const token = await createSessionToken(claim ? { ...base, billing: claim } : base);
  const { name, options } = getSessionCookieOptions();
  res.cookies.set(name, token, options);
  return res;
}
