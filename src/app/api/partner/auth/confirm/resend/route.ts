import { NextRequest, NextResponse } from "next/server";
import { clientIp } from "@/lib/auth/rate-limit";
import { handleResendConfirm } from "@/lib/partner/signup";
import { signupDeps } from "@/lib/partner/signup-deps";

// "Send the link again" (sign-in page, unconfirmed email). Same answer whether or not it sent.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const r = await handleResendConfirm(body, clientIp(request.headers), await signupDeps());
  return NextResponse.json(r.body, { status: r.status });
}
