// Money-path gaps found in the pre-launch billing audit: failed webhook writes, double returns
// from the card page, late Stripe failures, Aracuya (exempt) and amount units.

import { afterEach, describe, expect, it, vi } from "vitest";
import { completePaystackSetup, startCardSetup, changeRoomCount } from "./flow";
import { handlePaystackBillingEvent, handleStripeEvent } from "./webhooks";
import { runDailyBillingCheck } from "./notices";
import { paystackBillingApi } from "./paystack-api";
import { fakeStripe, makeDeps, stripeSub } from "./fakes.test-helper";

function failNextUpdate(store: { update: (...a: never[]) => Promise<void> }) {
  const real = store.update.bind(store);
  let failed = false;
  store.update = vi.fn(async (...a: never[]) => {
    if (!failed) {
      failed = true;
      throw new Error("db down");
    }
    return real(...a);
  });
}

describe("webhook write fails: the provider's retry is applied", () => {
  it("Paystack: payment after a failure still unlocks on the retry", async () => {
    const { deps, store } = makeDeps();
    store.add({ id: "h1", billing_status: "past_due", past_due_since: "2026-11-01T00:00:00.000Z", billing_provider: "paystack", billing_customer_id: "CUS_1", billing_subscription_id: "SUB_1" });
    failNextUpdate(store);
    const data = { id: 91, reference: "r91", customer: { customer_code: "CUS_1" }, plan: { plan_code: "PLN_small" } };
    await expect(handlePaystackBillingEvent(deps, "charge.success", data)).rejects.toThrow("db down");
    expect((await handlePaystackBillingEvent(deps, "charge.success", data)).handled).toBe(true);
    expect(store.hotels.get("h1")).toMatchObject({ billing_status: "active", past_due_since: null });
  });

  it("Stripe: same", async () => {
    const { deps, store } = makeDeps();
    store.add({ id: "h1", billing_status: "trialing", billing_provider: "stripe", billing_subscription_id: "sub_1" });
    failNextUpdate(store);
    const evt = { id: "evt_r", type: "invoice.paid", data: { object: { id: "in_1", subscription: "sub_1", amount_paid: 2500, currency: "usd" } } };
    await expect(handleStripeEvent(deps, evt)).rejects.toThrow("db down");
    expect((await handleStripeEvent(deps, evt)).handled).toBe(true);
    expect(store.hotels.get("h1")?.billing_status).toBe("active");
  });
});

describe("Paystack card page return", () => {
  it("two returns at once create one subscription (no double charge)", async () => {
    const { deps, store, paystack } = makeDeps();
    store.add({ id: "h1", billing_status: "pending_card", room_count: 3 });
    const [a, b] = await Promise.all([completePaystackSetup(deps, "h1", "abk_ref"), completePaystackSetup(deps, "h1", "abk_ref")]);
    expect(paystack.createSubscription).toHaveBeenCalledTimes(1);
    expect(a.trialEndsAt).toBeTruthy();
    expect(b.trialEndsAt).toBe(a.trialEndsAt);
    expect(store.hotels.get("h1")?.billing_status).toBe("trialing");
  });

  it("a failed subscription call can be retried with the same card check", async () => {
    const { deps, store, paystack } = makeDeps();
    store.add({ id: "h1", billing_status: "pending_card", room_count: 3 });
    paystack.createSubscription.mockRejectedValueOnce(new Error("paystack 500"));
    await expect(completePaystackSetup(deps, "h1", "abk_ref")).rejects.toThrow("paystack 500");
    await completePaystackSetup(deps, "h1", "abk_ref");
    expect(paystack.createSubscription).toHaveBeenCalledTimes(2);
    expect(store.hotels.get("h1")?.billing_status).toBe("trialing");
  });
});

describe("Stripe: late or out-of-order failure events", () => {
  it("a failure delivered after the hotel paid again is ignored (no new lock clock)", async () => {
    const { deps, store } = makeDeps({ stripe: fakeStripe(stripeSub({ status: "active" })) });
    store.add({ id: "h1", billing_status: "active", billing_provider: "stripe", billing_subscription_id: "sub_1" });
    const out = await handleStripeEvent(deps, { id: "evt_late", type: "invoice.payment_failed", data: { object: { subscription: "sub_1" } } });
    expect(out.handled).toBe(false);
    expect(store.hotels.get("h1")).toMatchObject({ billing_status: "active" });
    expect(store.hotels.get("h1")?.past_due_since).toBeUndefined();
    // A stale "subscription updated: past_due" is ignored the same way.
    await handleStripeEvent(deps, { id: "evt_old", type: "customer.subscription.updated", data: { object: { id: "sub_1", status: "past_due", customer: "cus_1", items: { data: [] } } } });
    expect(store.hotels.get("h1")?.billing_status).toBe("active");
  });
});

describe("Paystack events not yet covered", () => {
  it("renewal charge failed (found by customer): past_due", async () => {
    const { deps, store } = makeDeps();
    store.add({ id: "h1", billing_status: "active", billing_provider: "paystack", billing_customer_id: "CUS_1", billing_subscription_id: "SUB_1" });
    await handlePaystackBillingEvent(deps, "charge.failed", { id: 92, reference: "r92", customer: { customer_code: "CUS_1" }, plan: { plan_code: "PLN_large" } });
    expect(store.hotels.get("h1")?.billing_status).toBe("past_due");
  });

  it("invoice.create and a charge for someone else's plan change nothing", async () => {
    const { deps, store } = makeDeps();
    store.add({ id: "h1", billing_status: "active", billing_provider: "paystack", billing_customer_id: "CUS_1", billing_subscription_id: "SUB_1" });
    expect((await handlePaystackBillingEvent(deps, "invoice.create", { id: 93, subscription: { subscription_code: "SUB_1" } })).handled).toBe(false);
    expect((await handlePaystackBillingEvent(deps, "charge.success", { id: 94, customer: { customer_code: "CUS_1" }, plan: { plan_code: "PLN_other" } })).handled).toBe(false);
    expect(store.updates).toHaveLength(0);
  });
});

describe("Aracuya (billing exempt) is never charged or locked", () => {
  it("no card step, whatever its status", async () => {
    for (const billing_status of [null, "pending_card"]) {
      const { deps, store, paystack, stripe } = makeDeps();
      store.add({ id: "h1", slug: "aracuya", billing_exempt: true, billing_status, room_count: 8 });
      await expect(startCardSetup(deps, "h1", "paystack")).rejects.toMatchObject({ status: 409 });
      await expect(startCardSetup(deps, "h1", "stripe")).rejects.toMatchObject({ status: 409 });
      expect(paystack.initializeCardCheck).not.toHaveBeenCalled();
      expect(stripe.createCheckoutSession).not.toHaveBeenCalled();
    }
  });

  it("room change touches no plan, daily check sends nothing", async () => {
    const send = vi.fn(async () => ({ success: true }));
    const { deps, store, paystack, stripe } = makeDeps({ send, platformEmail: "ops@abeiku.test" });
    store.add({ id: "h1", slug: "aracuya", billing_exempt: true, billing_status: "past_due", past_due_since: "2026-01-01T00:00:00.000Z", billing_subscription_id: "SUB_x", billing_provider: "paystack" });
    await changeRoomCount(deps, "h1", 20);
    expect(paystack.createSubscription).not.toHaveBeenCalled();
    expect(stripe.changePrice).not.toHaveBeenCalled();
    expect(store.hotels.get("h1")?.billing_tier).toBeUndefined();
    expect(await runDailyBillingCheck(deps)).toMatchObject({ locked: 0, trialReminders: 0, ended: 0 });
    expect(send).not.toHaveBeenCalled();
  });
});

describe("amount units", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("Paystack card check goes out as 100 pesewas (GH₵1), cedis, card only", async () => {
    vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_x");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ status: true, data: { authorization_url: "https://x", reference: "r" } })));
    vi.stubGlobal("fetch", fetchMock);
    await paystackBillingApi.initializeCardCheck({ email: "o@t.gh", amountPesewas: 100, reference: "r", callbackUrl: "https://cb", metadata: {} });
    const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body).toMatchObject({ amount: 100, currency: "GHS", channels: ["card"] });
    vi.unstubAllEnvs();
  });
});
