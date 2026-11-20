// L3 billing: grace then lock, billing emails (once only), card change, restart, room limit,
// Abeiku branding on Stripe Checkout. No network: fakes and a mocked fetch; emails are a mock.

import { afterEach, describe, expect, it, vi } from "vitest";
import { adminRedirect, billingView, graceEndsAt, sessionBillingClaim, GRACE_DAYS } from "./access";
import { cancelBilling, completePaystackSetup, completeStripeSetup, restartBilling, startCardSetup, BillingError } from "./flow";
import { handlePaystackBillingEvent, handleStripeEvent } from "./webhooks";
import { runDailyBillingCheck } from "./notices";
import { LEGAL_LINE, formatMinor, notifyPlatform } from "./emails";
import { cardRedirect } from "./card-redirect";
import { checkoutForm, stripeBillingApi } from "./stripe-api";
import { paystackBillingApi } from "./paystack-api";
import { checkRoomLimit, countRoomUnits, loadRoomLimit, planRoomLimit, roomLimitMessage, roomsAfterSave, type RoomUnits } from "./room-limit";
import { makeDeps, NOW, stripeSub, fakeStripe } from "./fakes.test-helper";
import type { BillingDeps } from "./flow";

const DAY = 86_400_000;
const at = (days: number) => new Date(NOW.getTime() + days * DAY);

function mailer() {
  return vi.fn(async (_p: { to: string; subject: string; html: string; text?: string }) => ({ success: true }) as { success: boolean; error?: string });
}

/** Deps with a mock sendEmail and the platform address set. */
function mailDeps(over: Partial<BillingDeps> = {}) {
  const send = mailer();
  const m = makeDeps({ send, platformEmail: "ops@abeiku.test", ...over });
  return { ...m, send };
}
const sentTo = (send: ReturnType<typeof mailer>, to: string) => send.mock.calls.map((c) => c[0]).filter((p) => p.to === to);

// ── Grace then lock ─────────────────────────────────────────────────────

describe("grace period then lock", () => {
  const since = NOW.toISOString();
  const pastDue = { billing_status: "past_due", past_due_since: since };

  it("lock date is past_due_since + 14 days", () => {
    expect(GRACE_DAYS).toBe(14);
    expect(graceEndsAt(since)).toBe(at(14).toISOString());
    expect(graceEndsAt(null)).toBeNull();
    expect(graceEndsAt("nonsense")).toBeNull();
  });
  it("day 13: full access, red banner with the lock date", () => {
    const v = billingView(pastDue, at(13));
    expect(v.access).toBe("full");
    expect(v.banner).toEqual({ kind: "past_due", lockAt: at(14).toISOString(), locked: false });
    expect(adminRedirect(v, "/admin/bookings")).toBeNull();
  });
  it("day 15: locked to the Plan page, still a normal admin session", () => {
    const v = billingView(pastDue, at(15));
    expect(v.access).toBe("locked");
    expect(v.banner).toMatchObject({ kind: "past_due", locked: true });
    expect(sessionBillingClaim(v)).toBeUndefined();
    expect(adminRedirect(v, "/admin/bookings")).toBe("/admin/plan");
    expect(adminRedirect(v, "/admin")).toBe("/admin/plan");
    expect(adminRedirect(v, "/admin/plan")).toBeNull();
    expect(adminRedirect(v, null)).toBeNull(); // no path header: never loop
  });
  it("exactly 14 days: locked", () => {
    expect(billingView(pastDue, at(14)).access).toBe("locked");
  });
  it("past_due without past_due_since (before the SQL): full access", () => {
    expect(billingView({ billing_status: "past_due" }, at(100)).access).toBe("full");
  });
  it("exempt hotel is never locked", () => {
    expect(billingView({ ...pastDue, billing_exempt: true }, at(30)).access).toBe("full");
  });
  it("no card / ended still go to sign-up", () => {
    expect(adminRedirect(billingView({ billing_status: "pending_card" }), "/admin")).toBe("/signup");
    expect(adminRedirect(billingView({ billing_status: "canceled", current_period_end: "2026-01-01T00:00:00Z" }, NOW), "/admin/plan")).toBe("/signup");
  });

  it("first failure sets past_due_since, a second keeps it, paying again clears it", async () => {
    const { deps, store } = makeDeps();
    store.add({ id: "h1", billing_status: "active", billing_provider: "paystack", billing_subscription_id: "SUB_1", billing_customer_id: "CUS_1" });
    await handlePaystackBillingEvent(deps, "invoice.payment_failed", { id: 1, subscription: { subscription_code: "SUB_1" } });
    expect(store.hotels.get("h1")).toMatchObject({ billing_status: "past_due", past_due_since: NOW.toISOString() });

    const later = { ...deps, now: () => at(3) };
    await handlePaystackBillingEvent(later, "charge.failed", { id: 2, reference: "r2", customer: { customer_code: "CUS_1" }, plan: { plan_code: "PLN_small" } });
    expect(store.hotels.get("h1")?.past_due_since).toBe(NOW.toISOString());

    // Locked on day 15, then the new card is charged:
    expect(billingView(store.hotels.get("h1")!, at(15)).access).toBe("locked");
    await handlePaystackBillingEvent({ ...deps, now: () => at(15) }, "charge.success", { id: 3, reference: "r3", amount: 30000, currency: "GHS", customer: { customer_code: "CUS_1" }, plan: { plan_code: "PLN_small" } });
    const h = store.hotels.get("h1")!;
    expect(h).toMatchObject({ billing_status: "active", past_due_since: null });
    expect(billingView(h, at(15)).access).toBe("full");
  });

  it("Stripe: failed invoice sets it, paid invoice clears it", async () => {
    const { deps, store } = makeDeps({ stripe: fakeStripe(stripeSub({ status: "past_due" })) });
    store.add({ id: "h1", billing_status: "active", billing_provider: "stripe", billing_subscription_id: "sub_1" });
    await handleStripeEvent(deps, { id: "e1", type: "invoice.payment_failed", data: { object: { subscription: "sub_1" } } });
    expect(store.hotels.get("h1")?.past_due_since).toBe(NOW.toISOString());
    await handleStripeEvent(deps, { id: "e2", type: "invoice.paid", data: { object: { id: "in_2", subscription: "sub_1", amount_paid: 2500, currency: "usd" } } });
    expect(store.hotels.get("h1")).toMatchObject({ billing_status: "active", past_due_since: null });
  });

  it("cancelling while past due clears it too", async () => {
    const { deps, store } = makeDeps();
    store.add({ id: "h1", billing_status: "past_due", past_due_since: NOW.toISOString(), billing_provider: "stripe", billing_subscription_id: "sub_1" });
    await cancelBilling(deps, "h1");
    expect(store.hotels.get("h1")).toMatchObject({ billing_status: "canceled", past_due_since: null });
  });
});

// ── Billing emails ──────────────────────────────────────────────────────

describe("billing emails", () => {
  it("trial started: owner gets first charge date and amount, platform gets a sign-up note, once", async () => {
    const { deps, store, send } = mailDeps();
    store.add({ id: "h1", name: "Sunset Lodge", billing_status: "pending_card", room_count: 3 });
    await completePaystackSetup(deps, "h1", "abk_ref");
    await completePaystackSetup(deps, "h1", "abk_ref"); // repeat return: nothing new

    const owner = sentTo(send, "owner@test.gh");
    expect(owner).toHaveLength(1);
    expect(owner[0].subject).toBe("Your Abeiku free trial has started");
    expect(owner[0].text).toContain("GH₵300 on 15 December 2026");
    const ops = sentTo(send, "ops@abeiku.test");
    expect(ops).toHaveLength(1);
    expect(ops[0].subject).toBe("[Abeiku] New sign-up: Sunset Lodge");
  });

  it("every billing email carries the legal line", async () => {
    const { deps, store, send } = mailDeps();
    store.add({ id: "h1", billing_status: "pending_card", room_count: 3 });
    await completeStripeSetup(deps, "h1", "cs_1");
    expect(send.mock.calls.length).toBeGreaterThan(0);
    for (const [p] of send.mock.calls) {
      expect(p.text).toContain("Abeiku, operated by Automaddie LLC");
      expect(p.html).toContain("Abeiku, operated by Automaddie LLC");
    }
    expect(LEGAL_LINE).toBe("Abeiku, operated by Automaddie LLC");
  });

  it("payment failed: one email with how to fix it and the lock date, even on repeated failures", async () => {
    const { deps, store, send } = mailDeps({ stripe: fakeStripe(stripeSub({ status: "past_due" })) });
    store.add({ id: "h1", billing_status: "active", billing_provider: "stripe", billing_subscription_id: "sub_1", billing_tier: "small", billing_currency: "USD" });
    await handleStripeEvent(deps, { id: "e1", type: "invoice.payment_failed", data: { object: { subscription: "sub_1" } } });
    await handleStripeEvent(deps, { id: "e2", type: "invoice.payment_failed", data: { object: { subscription: "sub_1" } } });
    await handleStripeEvent(deps, { id: "e3", type: "customer.subscription.updated", data: { object: { id: "sub_1", status: "past_due", customer: "cus_1", items: { data: [] } } } });
    const owner = sentTo(send, "owner@test.gh");
    expect(owner).toHaveLength(1);
    expect(owner[0].subject).toBe("Your Abeiku payment failed");
    expect(owner[0].text).toContain("Update your card by 29 November 2026");
    expect(owner[0].text).toContain("/api/admin/billing/card");
    expect(sentTo(send, "ops@abeiku.test").map((p) => p.subject)).toEqual(["[Abeiku] Payment failed: Test Hotel"]);
  });

  it("a failed send is not marked sent: the next event tries again", async () => {
    const { deps, store, send } = mailDeps();
    store.add({ id: "h1", billing_status: "trialing", billing_provider: "stripe", billing_subscription_id: "sub_1", trial_ends_at: at(2).toISOString() });
    send.mockResolvedValueOnce({ success: false, error: "resend down" });
    await runDailyBillingCheck(deps);
    await runDailyBillingCheck(deps);
    await runDailyBillingCheck(deps);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][0].subject).toBe("Your Abeiku free trial ends in 3 days");
  });

  it("trial ends in 3 days: daily check and Stripe trial_will_end send it once between them", async () => {
    const { deps, store, send } = mailDeps();
    store.add({ id: "h1", billing_status: "trialing", billing_provider: "stripe", billing_subscription_id: "sub_1", trial_ends_at: at(3).toISOString(), billing_tier: "large", billing_currency: "USD" });
    store.add({ id: "h2", billing_status: "trialing", trial_ends_at: at(10).toISOString() }); // too early
    const r = await runDailyBillingCheck(deps);
    expect(r.trialReminders).toBe(1);
    await handleStripeEvent(deps, { id: "e9", type: "customer.subscription.trial_will_end", data: { object: { id: "sub_1", status: "trialing", items: { data: [] } } } });
    await runDailyBillingCheck({ ...deps, now: () => at(1) });
    const owner = sentTo(send, "owner@test.gh");
    expect(owner).toHaveLength(1);
    expect(owner[0].text).toContain("$40");
  });

  it("cancelled: owner gets the end date, platform a note", async () => {
    const { deps, store, send } = mailDeps();
    store.add({ id: "h1", name: "Sunset Lodge", billing_status: "active", billing_provider: "stripe", billing_subscription_id: "sub_1" });
    await cancelBilling(deps, "h1");
    const owner = sentTo(send, "owner@test.gh");
    expect(owner).toHaveLength(1);
    expect(owner[0].subject).toBe("Your Abeiku plan is cancelled");
    expect(owner[0].text).toContain("until 15 December 2026");
    expect(sentTo(send, "ops@abeiku.test")[0].subject).toBe("[Abeiku] Cancelled: Sunset Lodge");
    // The webhook that follows does not send it again.
    await handleStripeEvent(deps, { id: "e5", type: "customer.subscription.deleted", data: { object: { id: "sub_1", status: "canceled", items: { data: [] } } } });
    expect(sentTo(send, "owner@test.gh")).toHaveLength(1);
  });

  it("payment received: one receipt per invoice (invoice.paid + invoice.payment_succeeded)", async () => {
    const { deps, store, send } = mailDeps();
    store.add({ id: "h1", billing_status: "trialing", billing_provider: "stripe", billing_subscription_id: "sub_1" });
    const inv = { id: "in_1", subscription: "sub_1", amount_paid: 2500, currency: "usd" };
    await handleStripeEvent(deps, { id: "e1", type: "invoice.paid", data: { object: inv } });
    await handleStripeEvent(deps, { id: "e2", type: "invoice.payment_succeeded", data: { object: inv } });
    const receipts = sentTo(send, "owner@test.gh").filter((p) => p.subject === "Abeiku payment received");
    expect(receipts).toHaveLength(1);
    expect(receipts[0].text).toContain("We received $25");
  });

  it("plan ended and locked: platform notes from the daily check, once", async () => {
    const { deps, store, send } = mailDeps();
    store.add({ id: "h1", name: "Gone Inn", billing_status: "canceled", current_period_end: at(-2).toISOString() });
    store.add({ id: "h2", name: "Old Inn", billing_status: "canceled", current_period_end: at(-60).toISOString() }); // long ago: quiet
    store.add({ id: "h3", name: "Late Inn", billing_status: "past_due", past_due_since: at(-20).toISOString() });
    const r = await runDailyBillingCheck(deps);
    await runDailyBillingCheck(deps);
    expect(r).toMatchObject({ ended: 1, locked: 1 });
    expect(sentTo(send, "ops@abeiku.test").map((p) => p.subject).sort()).toEqual(["[Abeiku] Locked: Late Inn", "[Abeiku] Plan ended: Gone Inn"]);
    expect(sentTo(send, "owner@test.gh")).toHaveLength(0);
  });

  it("no send function: nothing is claimed or sent", async () => {
    const { deps, store } = makeDeps();
    store.add({ id: "h1", billing_status: "trialing", trial_ends_at: at(2).toISOString() });
    await runDailyBillingCheck(deps);
    expect(store.emailKeys.size).toBe(0);
    expect(await notifyPlatform({ store }, "x", "y")).toBe("off");
  });

  it("amounts in pesewas and cents", () => {
    expect(formatMinor(30000, "GHS")).toBe("GH₵300");
    expect(formatMinor(2550, "usd")).toBe("$25.50");
  });
});

// ── Change card ─────────────────────────────────────────────────────────

describe("change card (/api/admin/billing/card)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.PAYSTACK_SECRET_KEY;
  });

  it("Stripe: Billing Portal for the hotel's customer, back to the Plan page", async () => {
    const { deps, store, stripe } = makeDeps();
    store.add({ id: "h1", billing_status: "past_due", billing_provider: "stripe", billing_customer_id: "cus_9", billing_subscription_id: "sub_1" });
    const res = await cardRedirect("h1", deps, "https://abeiku.test");
    expect(res.status).toBe(303);
    expect(stripe.createPortalSession).toHaveBeenCalledWith("cus_9", "https://abeiku.test/admin/plan");
    expect(res.headers.get("location")).toMatch(/^https:\/\/billing\.stripe\.test\/cus_9/);
  });
  it("Paystack: the hosted manage link for the subscription", async () => {
    const { deps, store, paystack } = makeDeps();
    store.add({ id: "h1", billing_status: "active", billing_provider: "paystack", billing_subscription_id: "SUB_7" });
    const res = await cardRedirect("h1", deps, "https://abeiku.test");
    expect(paystack.manageLink).toHaveBeenCalledWith("SUB_7");
    expect(res.headers.get("location")).toBe("https://paystack.test/manage/SUB_7");
  });
  it("no card on file, not billed, or a provider error: back to the Plan page with an error", async () => {
    const { deps, store, stripe } = makeDeps();
    store.add({ id: "h1", billing_status: "pending_card", billing_provider: "stripe" });
    store.add({ id: "h2" }); // legacy
    store.add({ id: "h3", billing_status: "active", billing_provider: "stripe", billing_customer_id: "cus_3" });
    stripe.createPortalSession.mockRejectedValueOnce(new Error("portal not configured"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (const id of ["h1", "h2", "h3"]) {
      expect((await cardRedirect(id, deps, "https://abeiku.test")).headers.get("location")).toBe("https://abeiku.test/admin/plan?card=error");
    }
    expect((await cardRedirect(null, deps, "https://abeiku.test")).headers.get("location")).toBe("https://abeiku.test/admin/login");
  });

  it("real Stripe call: POST /v1/billing_portal/sessions with customer and return_url", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ url: "https://billing.stripe.com/p/session/x" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const url = await stripeBillingApi.createPortalSession("cus_1", "https://abeiku.com/admin/plan");
    expect(url).toBe("https://billing.stripe.com/p/session/x");
    const [u, init] = fetchMock.mock.calls[0];
    expect(u).toBe("https://api.stripe.com/v1/billing_portal/sessions");
    expect(init?.method).toBe("POST");
    expect(new URLSearchParams(String(init?.body)).get("customer")).toBe("cus_1");
    expect(new URLSearchParams(String(init?.body)).get("return_url")).toBe("https://abeiku.com/admin/plan");
  });
  it("real Paystack call: GET /subscription/:code/manage/link, returns data.link", async () => {
    process.env.PAYSTACK_SECRET_KEY = "sk_test_y";
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      new Response(JSON.stringify({ status: true, data: { link: "https://paystack.com/manage/subscriptions/qlgwhpyq1ts9nsw?subscription_token=t" } }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);
    const link = await paystackBillingApi.manageLink("SUB_7");
    expect(link).toMatch(/^https:\/\/paystack\.com\/manage\/subscriptions\//);
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.paystack.co/subscription/SUB_7/manage/link");
    expect(fetchMock.mock.calls[0][1]?.method).toBe("GET");
  });
  it("real calls refuse live keys without BILLING_LIVE", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_live_x";
    vi.stubGlobal("fetch", vi.fn());
    await expect(stripeBillingApi.createPortalSession("cus_1", "https://x")).rejects.toThrow(/live key refused/);
  });
});

// ── Start again after the plan ended ────────────────────────────────────

describe("start again after the plan ended", () => {
  const ended = { billing_status: "canceled", current_period_end: at(-5).toISOString(), trial_ends_at: at(-40).toISOString(), room_count: 3, billing_subscription_id: "sub_old" };

  it("only an ended plan can restart", async () => {
    const { deps, store } = makeDeps();
    store.add({ id: "h1", billing_status: "canceled", current_period_end: at(5).toISOString() });
    await expect(restartBilling(deps, "h1")).rejects.toBeInstanceOf(BillingError);
  });
  it("Stripe: back to pending_card, checkout with no trial, then active", async () => {
    const stripe = fakeStripe(stripeSub({ status: "active", trial_end: null }));
    const { deps, store } = makeDeps({ stripe });
    store.add({ id: "h1", ...ended });
    await restartBilling(deps, "h1");
    expect(store.hotels.get("h1")).toMatchObject({ billing_status: "pending_card", billing_subscription_id: null });
    expect(billingView(store.hotels.get("h1")!, NOW).access).toBe("needs_card");

    await startCardSetup(deps, "h1", "stripe");
    expect(stripe.createCheckoutSession.mock.calls[0][0]).toMatchObject({ trialDays: 0 });
    const r = await completeStripeSetup(deps, "h1", "cs_1");
    expect(r.trialEndsAt).toBeNull();
    expect(store.hotels.get("h1")?.billing_status).toBe("active");
  });
  it("Paystack: subscription starts now (no trial), status active, old trial date kept", async () => {
    const { deps, store, paystack } = makeDeps();
    store.add({ id: "h1", ...ended });
    await restartBilling(deps, "h1");
    await startCardSetup(deps, "h1", "paystack");
    expect(paystack.initializeCardCheck.mock.calls[0][0].metadata).toMatchObject({ trial: false });
    const r = await completePaystackSetup(deps, "h1", "abk_ref");
    expect(paystack.createSubscription.mock.calls[0][0].startDate).toBe(NOW.toISOString());
    expect(r.trialEndsAt).toBeNull();
    expect(store.hotels.get("h1")).toMatchObject({ billing_status: "active", trial_ends_at: ended.trial_ends_at });
  });
  it("cancelled before ever adding a card: restart still gets the trial", async () => {
    const { deps, store, stripe } = makeDeps();
    store.add({ id: "h1", billing_status: "canceled", current_period_end: at(-1).toISOString(), room_count: 2 });
    await restartBilling(deps, "h1");
    await startCardSetup(deps, "h1", "stripe");
    expect(stripe.createCheckoutSession.mock.calls[0][0]).toMatchObject({ trialDays: 30 });
  });
  it("a first sign-up still gets the 30-day trial", async () => {
    const { deps, store, stripe } = makeDeps();
    store.add({ id: "h1", billing_status: "pending_card", room_count: 3 });
    await startCardSetup(deps, "h1", "stripe");
    expect(stripe.createCheckoutSession.mock.calls[0][0]).toMatchObject({ trialDays: 30 });
  });
});

// ── Stripe Checkout branding ────────────────────────────────────────────

describe("Stripe Checkout says Abeiku", () => {
  const base = { price: "price_small", hotelId: "h1", email: "o@x.test", successUrl: "https://s", cancelUrl: "https://c" };
  it("names Abeiku and the legal line; trial days when there is a trial", () => {
    const f = checkoutForm({ ...base, trialDays: 30 });
    expect(f["subscription_data[description]"]).toBe("Abeiku monthly plan");
    expect(f["subscription_data[invoice_settings][footer]"]).toBe(LEGAL_LINE);
    expect(f["custom_text[submit][message]"]).toContain(LEGAL_LINE);
    expect(f["subscription_data[trial_period_days]"]).toBe("30");
  });
  it("no trial: trial_period_days left out (Stripe needs at least 1)", () => {
    expect(checkoutForm({ ...base, trialDays: 0 })).not.toHaveProperty("subscription_data[trial_period_days]");
  });
});

// ── Room limit ──────────────────────────────────────────────────────────

describe("room limit", () => {
  const std = (id: string, n: number): RoomUnits => ({ id, room_type: "standard", total_rooms: n, group_id: null });
  const small = { slug: "sunset", billing_status: "active", billing_tier: "small" };

  it("counts units: multi-unit rooms by total_rooms, a house with member rooms not twice", () => {
    expect(countRoomUnits([std("a", 3), std("b", 1)])).toBe(4);
    const house: RoomUnits = { id: "g", room_type: "group", total_rooms: 1, group_id: null };
    const members: RoomUnits[] = [1, 2, 3].map((i) => ({ id: `m${i}`, room_type: "individual", total_rooms: 1, group_id: "g" }));
    expect(countRoomUnits([house, ...members])).toBe(3);
    expect(countRoomUnits([house])).toBe(1);
  });
  it("small plan allows up to 5; under and at are fine, over is refused with the message", () => {
    const limit = planRoomLimit(small);
    expect(limit).toBe(5);
    const four = [std("a", 2), std("b", 2)];
    expect(checkRoomLimit(limit, four, roomsAfterSave(four, std("new", 1)))).toEqual({ ok: true }); // at 5
    const r = checkRoomLimit(limit, four, roomsAfterSave(four, std("new", 2))); // 6
    expect(r).toEqual({ ok: false, limit: 5, count: 6, error: "Your plan covers up to 5 rooms. Upgrade your plan on the Plan page to add more." });
    expect(checkRoomLimit(limit, [], [std("a", 3)])).toEqual({ ok: true }); // under
  });
  it("raising a multi-unit room's count over the limit is refused", () => {
    const rooms = [std("a", 3), std("b", 1)];
    expect(checkRoomLimit(5, rooms, roomsAfterSave(rooms, { id: "a", total_rooms: 5 })).ok).toBe(false);
    expect(checkRoomLimit(5, rooms, roomsAfterSave(rooms, { id: "a", total_rooms: 4 })).ok).toBe(true);
  });
  it("a hotel already over the limit can still edit without adding rooms", () => {
    const over = [std("a", 8)];
    expect(checkRoomLimit(5, over, roomsAfterSave(over, { id: "a", total_rooms: 8 })).ok).toBe(true);
    expect(checkRoomLimit(5, over, roomsAfterSave(over, { id: "a", total_rooms: 9 })).ok).toBe(false);
  });
  it("not limited: Aracuya and Test Hotel, billing-exempt, no billing record, large plan", () => {
    expect(planRoomLimit({ ...small, slug: "aracuya" })).toBeNull();
    expect(planRoomLimit({ ...small, slug: "test-hotel" })).toBeNull();
    expect(planRoomLimit({ ...small, billing_exempt: true })).toBeNull();
    expect(planRoomLimit({ slug: "old-hotel" })).toBeNull();
    expect(planRoomLimit({ ...small, billing_tier: "large" })).toBeNull();
    expect(planRoomLimit(null)).toBeNull();
    expect(planRoomLimit({ slug: "x", billing_status: "trialing", room_count: 4 })).toBe(5); // tier from rooms
  });
  it("a billing read error never blocks", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await loadRoomLimit("h1", async () => { throw new Error("db down"); })).toBeNull();
    expect(await loadRoomLimit("h1", async () => small)).toBe(5);
  });
  it("message names the limit", () => {
    expect(roomLimitMessage(5)).toContain("up to 5 rooms");
  });
});
