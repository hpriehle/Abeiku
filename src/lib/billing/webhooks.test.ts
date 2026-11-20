import crypto from "crypto";
import { describe, it, expect } from "vitest";
import {
  handlePaystackBillingEvent,
  handleStripeEvent,
  isPaystackBillingEvent,
  verifyPaystackSignature,
  verifyStripeSignature,
} from "./webhooks";
import { makeDeps, PLAN_IDS, paystackUnpaid, stripeSub, fakeStripe } from "./fakes.test-helper";

const PS_SECRET = "sk_test_abc";
const WH_SECRET = "whsec_test_123";

function paystackSig(body: string, secret = PS_SECRET) {
  return crypto.createHmac("sha512", secret).update(body).digest("hex");
}
function stripeHeader(body: string, t: number, secret = WH_SECRET) {
  return `t=${t},v1=${crypto.createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;
}

describe("Paystack signature", () => {
  const body = JSON.stringify({ event: "invoice.update", data: { id: 1 } });
  it("accepts the right HMAC-SHA512", () => {
    expect(verifyPaystackSignature(body, paystackSig(body), PS_SECRET)).toBe(true);
  });
  it("rejects a wrong secret, a changed body, a missing header or a missing secret", () => {
    expect(verifyPaystackSignature(body, paystackSig(body, "sk_test_other"), PS_SECRET)).toBe(false);
    expect(verifyPaystackSignature(body + " ", paystackSig(body), PS_SECRET)).toBe(false);
    expect(verifyPaystackSignature(body, null, PS_SECRET)).toBe(false);
    expect(verifyPaystackSignature(body, paystackSig(body), undefined)).toBe(false);
    expect(verifyPaystackSignature(body, "short", PS_SECRET)).toBe(false);
  });
});

describe("Stripe signature", () => {
  const body = JSON.stringify({ id: "evt_1", type: "invoice.paid" });
  const now = 1_800_000_000;
  it("accepts a fresh, correct v1 (also among several)", () => {
    expect(verifyStripeSignature(body, stripeHeader(body, now), WH_SECRET, now)).toBe(true);
    const h = `t=${now},v1=deadbeef,${stripeHeader(body, now).split(",")[1]}`;
    expect(verifyStripeSignature(body, h, WH_SECRET, now)).toBe(true);
  });
  it("rejects wrong secret, changed body, old timestamp, missing parts", () => {
    expect(verifyStripeSignature(body, stripeHeader(body, now, "whsec_other"), WH_SECRET, now)).toBe(false);
    expect(verifyStripeSignature(body + "x", stripeHeader(body, now), WH_SECRET, now)).toBe(false);
    expect(verifyStripeSignature(body, stripeHeader(body, now - 301), WH_SECRET, now)).toBe(false);
    expect(verifyStripeSignature(body, `t=${now}`, WH_SECRET, now)).toBe(false);
    expect(verifyStripeSignature(body, null, WH_SECRET, now)).toBe(false);
    expect(verifyStripeSignature(body, stripeHeader(body, now), undefined, now)).toBe(false);
  });
});

describe("which Paystack events are billing", () => {
  it("subscription and invoice events, plan charges and the card check", () => {
    expect(isPaystackBillingEvent("subscription.disable", {}, PLAN_IDS)).toBe(true);
    expect(isPaystackBillingEvent("invoice.payment_failed", {}, PLAN_IDS)).toBe(true);
    expect(isPaystackBillingEvent("charge.success", { plan: { plan_code: "PLN_small" } }, PLAN_IDS)).toBe(true);
    expect(isPaystackBillingEvent("charge.success", { metadata: { purpose: "abeiku_card_check" } }, PLAN_IDS)).toBe(true);
  });
  it("guest booking payments and payouts are not billing", () => {
    expect(isPaystackBillingEvent("charge.success", { reference: "bk_1", plan: {}, metadata: { guest_name: "A" } }, PLAN_IDS)).toBe(false);
    expect(isPaystackBillingEvent("charge.failed", { reference: "bk_1", plan: null }, PLAN_IDS)).toBe(false);
    expect(isPaystackBillingEvent("charge.success", { plan: { plan_code: "PLN_someone_else" } }, PLAN_IDS)).toBe(false);
    expect(isPaystackBillingEvent("transfer.success", {}, PLAN_IDS)).toBe(false);
  });
});

function paystackHotel() {
  const m = makeDeps();
  m.store.add({
    id: "h1",
    billing_status: "trialing",
    billing_provider: "paystack",
    billing_customer_id: "CUS_1",
    billing_subscription_id: "SUB_1",
    trial_ends_at: "2026-12-15T10:00:00.000Z",
    current_period_end: "2026-12-15T10:00:00.000Z",
  });
  return m;
}

describe("Paystack billing events", () => {
  it("renewal charge succeeded: active", async () => {
    const { deps, store } = paystackHotel();
    const out = await handlePaystackBillingEvent(deps, "charge.success", { id: 77, reference: "r1", customer: { customer_code: "CUS_1" }, plan: { plan_code: "PLN_small" } });
    expect(out.handled).toBe(true);
    expect(store.hotels.get("h1")?.billing_status).toBe("active");
  });
  it("invoice paid: active, period end moves to the next payment date", async () => {
    const { deps, store } = paystackHotel();
    await handlePaystackBillingEvent(deps, "invoice.update", {
      id: 5, paid: true, status: "success", subscription: { subscription_code: "SUB_1", next_payment_date: "2027-01-15T10:00:00.000Z" },
    });
    expect(store.hotels.get("h1")).toMatchObject({ billing_status: "active", current_period_end: "2027-01-15T10:00:00.000Z" });
  });
  it("charge failed: past_due", async () => {
    const { deps, store, paystack } = paystackHotel();
    paystackUnpaid(paystack);
    await handlePaystackBillingEvent(deps, "invoice.payment_failed", { id: 6, subscription: { subscription_code: "SUB_1" } });
    expect(store.hotels.get("h1")?.billing_status).toBe("past_due");
  });
  it("disabled: cancelled, access to next payment date", async () => {
    const { deps, store } = paystackHotel();
    await handlePaystackBillingEvent(deps, "subscription.disable", { id: 7, subscription_code: "SUB_1", next_payment_date: "2026-12-15T10:00:00.000Z" });
    expect(store.hotels.get("h1")).toMatchObject({ billing_status: "canceled", current_period_end: "2026-12-15T10:00:00.000Z" });
  });
  it("same delivery twice: applied once", async () => {
    const { deps, store, paystack } = paystackHotel();
    paystackUnpaid(paystack);
    const data = { id: 6, subscription: { subscription_code: "SUB_1" } };
    await handlePaystackBillingEvent(deps, "invoice.payment_failed", data);
    const again = await handlePaystackBillingEvent(deps, "invoice.payment_failed", data);
    expect(again.note).toBe("repeat delivery");
    expect(store.updates).toHaveLength(1);
  });
  it("an old subscription (replaced on a tier change) does not touch the hotel", async () => {
    const { deps, store } = paystackHotel();
    const out = await handlePaystackBillingEvent(deps, "subscription.disable", { id: 8, subscription_code: "SUB_old" });
    expect(out.handled).toBe(false);
    expect(store.hotels.get("h1")?.billing_status).toBe("trialing");
  });
  it("a late charge does not bring back a cancelled hotel", async () => {
    const { deps, store } = paystackHotel();
    await store.update("h1", { billing_status: "canceled" });
    const out = await handlePaystackBillingEvent(deps, "invoice.update", { id: 9, paid: true, subscription: { subscription_code: "SUB_1" } });
    expect(out.handled).toBe(false);
    expect(store.hotels.get("h1")?.billing_status).toBe("canceled");
  });
  it("card check charge is left to the return page", async () => {
    const { deps, store } = paystackHotel();
    const out = await handlePaystackBillingEvent(deps, "charge.success", { metadata: { purpose: "abeiku_card_check", hotel_id: "h1" } });
    expect(out.handled).toBe(false);
    expect(store.updates).toHaveLength(0);
  });
});

function stripeHotel(sub = stripeSub()) {
  const m = makeDeps({ stripe: fakeStripe(sub) });
  m.store.add({ id: "h1", billing_status: "trialing", billing_provider: "stripe", billing_customer_id: "cus_1", billing_subscription_id: "sub_1", trial_ends_at: "2026-12-15T10:00:00.000Z" });
  return m;
}
const subObj = (o: Record<string, unknown>) => ({
  id: "sub_1", status: "trialing", customer: "cus_1", trial_end: null, cancel_at_period_end: false, cancel_at: null,
  items: { data: [{ id: "si_1", price: { id: "price_small" }, current_period_end: 1_797_000_000 }] }, metadata: {}, ...o,
});

describe("Stripe events", () => {
  it("checkout completed: trial started (if the return page was missed)", async () => {
    const { deps, store } = makeDeps();
    store.add({ id: "h1", billing_status: "pending_card", room_count: 2 });
    const out = await handleStripeEvent(deps, { id: "evt_1", type: "checkout.session.completed", data: { object: { mode: "subscription", client_reference_id: "h1", subscription: "sub_1" } } });
    expect(out.handled).toBe(true);
    expect(store.hotels.get("h1")).toMatchObject({ billing_status: "trialing", billing_subscription_id: "sub_1", billing_customer_id: "cus_1" });
  });
  it("invoice paid with money: active; $0 trial invoice: no change", async () => {
    const { deps, store } = stripeHotel();
    await handleStripeEvent(deps, { id: "evt_0", type: "invoice.paid", data: { object: { subscription: "sub_1", amount_paid: 0 } } });
    expect(store.hotels.get("h1")?.billing_status).toBe("trialing");
    await handleStripeEvent(deps, { id: "evt_2", type: "invoice.paid", data: { object: { subscription: "sub_1", amount_paid: 2500 } } });
    expect(store.hotels.get("h1")?.billing_status).toBe("active");
  });
  it("invoice payment failed (new API shape, subscription under parent): past_due", async () => {
    const { deps, store } = stripeHotel(stripeSub({ status: "past_due" }));
    await handleStripeEvent(deps, { id: "evt_3", type: "invoice.payment_failed", data: { object: { parent: { subscription_details: { subscription: "sub_1" } } } } });
    expect(store.hotels.get("h1")?.billing_status).toBe("past_due");
  });
  it("subscription updated to past_due, period end read from the item", async () => {
    const { deps, store } = stripeHotel(stripeSub({ status: "past_due" }));
    await handleStripeEvent(deps, { id: "evt_4", type: "customer.subscription.updated", data: { object: subObj({ status: "past_due" }) } });
    expect(store.hotels.get("h1")).toMatchObject({ billing_status: "past_due", current_period_end: new Date(1_797_000_000_000).toISOString() });
  });
  it("subscription deleted in the trial: cancelled, access kept to trial end", async () => {
    const { deps, store } = stripeHotel();
    await handleStripeEvent(deps, { id: "evt_5", type: "customer.subscription.deleted", data: { object: subObj({ status: "canceled", items: { data: [] } }) } });
    expect(store.hotels.get("h1")).toMatchObject({ billing_status: "canceled", current_period_end: "2026-12-15T10:00:00.000Z" });
  });
  it("repeat delivery and unknown subscriptions change nothing", async () => {
    const { deps, store } = stripeHotel(stripeSub({ status: "past_due" }));
    const evt = { id: "evt_6", type: "invoice.payment_failed", data: { object: { subscription: "sub_1" } } };
    await handleStripeEvent(deps, evt);
    expect((await handleStripeEvent(deps, evt)).note).toBe("repeat delivery");
    expect((await handleStripeEvent(deps, { id: "evt_7", type: "invoice.payment_failed", data: { object: { subscription: "sub_x" } } })).handled).toBe(false);
    expect(store.updates).toHaveLength(1);
  });
});
