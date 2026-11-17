import { NextRequest, NextResponse } from "next/server";
import { clearKeys, loginKeys } from "@/lib/auth/rate-limit";
import { handlePartnerReset } from "@/lib/partner/signup";
import { signupDeps } from "@/lib/partner/signup-deps";

// Partner reset link used: new password for the account (same pattern as /api/admin/auth/reset).
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  try {
    const deps = await signupDeps();
    const r = await handlePartnerReset(body, deps);
    // Unlock sign-in if failed tries locked it (the IP counter is left alone).
    if (r.accountEmail) await clearKeys(deps.attempts, [loginKeys("partner", "", r.accountEmail)[1]]);
    return NextResponse.json(r.body, { status: r.status });
  } catch (err) {
    console.error("[partner-reset] failed:", (err as Error).message);
    return NextResponse.json({ error: "Something went wrong. Please try again, or ask for a new link." }, { status: 500 });
  }
}
