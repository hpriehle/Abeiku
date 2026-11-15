// Shared bits for the sign-up and billing routes (server only).

import { NextResponse } from "next/server";
import { getSession, type SessionPayload } from "@/lib/admin/auth";
import { BillingError } from "./flow";
import { isMissingColumnError } from "./store";

export async function requireSession(): Promise<SessionPayload | NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Please log in again." }, { status: 401 });
  return session;
}

/** Turns any error into a short JSON reply; owner-facing text only for BillingError. */
export function errorResponse(err: unknown, where: string): NextResponse {
  if (err instanceof BillingError) {
    if (err.status >= 500) console.error(`[billing] ${where}:`, err.message);
    return NextResponse.json({ error: err.userMessage }, { status: err.status });
  }
  if (isMissingColumnError(err)) {
    console.error(`[billing] ${where}: billing columns missing, run docs/l2-signup/billing.sql`);
    return NextResponse.json({ error: "Sign-up is not ready yet. Please try again later." }, { status: 503 });
  }
  console.error(`[billing] ${where}:`, err);
  return NextResponse.json({ error: "Something went wrong on our side. Please try again in a moment." }, { status: 500 });
}
