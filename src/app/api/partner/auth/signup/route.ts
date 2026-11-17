import { NextRequest, NextResponse } from "next/server";
import { clientIp } from "@/lib/auth/rate-limit";
import { handlePartnerSignup } from "@/lib/partner/signup";
import { signupDeps } from "@/lib/partner/signup-deps";

// P2 step 2: open partner sign-up. Creates the account and emails a confirm link; no session until
// the email is confirmed.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  try {
    const r = await handlePartnerSignup(body, clientIp(request.headers), await signupDeps());
    return NextResponse.json(r.body, { status: r.status });
  } catch (err) {
    console.error("[partner-signup] failed:", (err as Error).message);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
