// POST /api/stripe/webhook: Stripe events for Abeiku's own hotel subscriptions (L2 billing).
// Signature checked with STRIPE_WEBHOOK_SECRET (whsec_...) before anything is read.

import { NextRequest, NextResponse } from "next/server";
import { billingDeps } from "@/lib/billing";
import { handleStripeEvent, verifyStripeSignature } from "@/lib/billing/webhooks";
import { opsAlert } from "@/lib/ops/alerts";

export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (!verifyStripeSignature(raw, request.headers.get("stripe-signature"), process.env.STRIPE_WEBHOOK_SECRET)) {
    console.error("Stripe webhook: signature verification failed");
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }
  let evt: { id: string; type: string; data: { object: Record<string, unknown> } };
  try {
    evt = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  try {
    const out = await handleStripeEvent(billingDeps(), evt);
    console.log(`[billing] stripe ${evt.type}: ${out.note}`);
    return NextResponse.json({ received: true });
  } catch (err) {
    // 500 so Stripe retries later (e.g. the database was down).
    console.error(`[billing] stripe ${evt.type} failed:`, err);
    await opsAlert("stripe-webhook", `Stripe webhook ${evt.type} failed`, err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
