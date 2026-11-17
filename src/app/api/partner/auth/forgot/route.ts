import { NextRequest, NextResponse } from "next/server";
import { clientIp } from "@/lib/auth/rate-limit";
import { handlePartnerForgot } from "@/lib/partner/signup";
import { signupDeps } from "@/lib/partner/signup-deps";

// Partner "forgot password" (same pattern as /api/admin/auth/forgot).
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const r = await handlePartnerForgot(body, clientIp(request.headers), await signupDeps());
  return NextResponse.json(r.body, { status: r.status });
}
