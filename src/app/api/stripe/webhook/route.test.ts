import crypto from "crypto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const SECRET = "whsec_test";
process.env.STRIPE_WEBHOOK_SECRET = SECRET;

const { makeDeps, fakeStripe, stripeSub } = await import("@/lib/billing/fakes.test-helper");
let m = makeDeps();
vi.mock("@/lib/billing", () => ({ billingDeps: () => m.deps }));
const { POST } = await import("./route");

function send(payload: object, opts: { secret?: string; t?: number } = {}) {
  const body = JSON.stringify(payload);
  const t = opts.t ?? Math.floor(Date.now() / 1000);
  const v1 = crypto.createHmac("sha256", opts.secret ?? SECRET).update(`${t}.${body}`).digest("hex");
  return POST(new NextRequest("http://localhost/api/stripe/webhook", { method: "POST", headers: { "stripe-signature": `t=${t},v1=${v1}` }, body }));
}

describe("POST /api/stripe/webhook", () => {
  beforeEach(() => {
    m = makeDeps({ stripe: fakeStripe(stripeSub({ status: "past_due" })) }); // Stripe says the subscription is unpaid
    m.store.add({ id: "h1", billing_status: "active", billing_provider: "stripe", billing_subscription_id: "sub_1" });
  });
  const failed = { id: "evt_1", type: "invoice.payment_failed", data: { object: { subscription: "sub_1" } } };

  it("good signature: charge failed marks past_due", async () => {
    expect((await send(failed)).status).toBe(200);
    expect(m.store.hotels.get("h1")?.billing_status).toBe("past_due");
  });
  it("wrong secret: 400, nothing changes", async () => {
    expect((await send(failed, { secret: "whsec_other" })).status).toBe(400);
    expect(m.store.updates).toHaveLength(0);
  });
  it("replayed old delivery: 400", async () => {
    expect((await send(failed, { t: Math.floor(Date.now() / 1000) - 3600 })).status).toBe(400);
  });
  it("unknown event types are acknowledged", async () => {
    expect((await send({ id: "evt_2", type: "customer.created", data: { object: {} } })).status).toBe(200);
  });
});
