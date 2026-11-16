import { describe, it, expect } from "vitest";
import { daysLeft, parseRoomCount, planIdsFromEnv, tierForPlanId, tierForRooms, trialEndsAt, monthlyPrice, formatPrice } from "./plans";
import { billingView, blockedAdminApiAllowed, sessionBillingClaim } from "./access";
import { cancelBilling, changeRoomCount, completePaystackSetup, completeStripeSetup, resumePendingSetup, startCardSetup, BillingError } from "./flow";
import { makeDeps, NOW, PLAN_IDS } from "./fakes.test-helper";
import { isMissingColumnError } from "./store";
import { parseAccount, parseCalendarLinks, parseHotelDetails, slugify, TERMS_REQUIRED_ERROR } from "./signup-input";

describe("tier choice", () => {
  it("up to 5 rooms is small, 6 or more is large", () => {
    expect([1, 2, 5].map(tierForRooms)).toEqual(["small", "small", "small"]);
    expect([6, 7, 40].map(tierForRooms)).toEqual(["large", "large", "large"]);
  });
  it("prices match the landing page in both currencies", () => {
    expect(monthlyPrice("small", "GHS")).toBe(300);
    expect(monthlyPrice("small", "USD")).toBe(25);
    expect(monthlyPrice("large", "GHS")).toBe(500);
    expect(monthlyPrice("large", "USD")).toBe(40);
    expect(formatPrice("large", "GHS")).toBe("GH₵500");
    expect(formatPrice("small", "USD")).toBe("$25");
  });
  it("room count must be a whole number from 1", () => {
    expect(parseRoomCount("6")).toBe(6);
    expect(parseRoomCount(3)).toBe(3);
    expect(parseRoomCount(0)).toBeNull();
    expect(parseRoomCount(2.5)).toBeNull();
    expect(parseRoomCount("abc")).toBeNull();
    expect(parseRoomCount(10000)).toBeNull();
  });
  it("plan ids come from env and map back to a tier", () => {
    const ids = planIdsFromEnv({ PAYSTACK_PLAN_SMALL: "PLN_a", PAYSTACK_PLAN_LARGE: " PLN_b ", STRIPE_PRICE_SMALL: "price_a" } as unknown as NodeJS.ProcessEnv);
    expect(ids.paystack).toEqual({ small: "PLN_a", large: "PLN_b" });
    expect(ids.stripe).toEqual({ small: "price_a", large: null });
    expect(tierForPlanId(ids, "paystack", "PLN_b")).toBe("large");
    expect(tierForPlanId(ids, "paystack", "PLN_other")).toBeNull();
    expect(tierForPlanId(ids, "stripe", null)).toBeNull();
  });
});

describe("trial dates", () => {
  it("first charge is 30 days after the card is added", () => {
    expect(trialEndsAt(NOW).toISOString()).toBe("2026-12-15T10:00:00.000Z");
  });
  it("days left rounds up and never goes below 0", () => {
    expect(daysLeft("2026-12-15T10:00:00.000Z", NOW)).toBe(30);
    expect(daysLeft("2026-11-15T10:00:01.000Z", NOW)).toBe(1);
    expect(daysLeft("2026-11-14T10:00:00.000Z", NOW)).toBe(0);
    expect(daysLeft(null, NOW)).toBe(0);
    expect(daysLeft("not a date", NOW)).toBe(0);
  });
});

describe("gating (billingView)", () => {
  it("columns missing or no status: full access, not billed (Aracuya before the SQL)", () => {
    const v = billingView({});
    expect(v.access).toBe("full");
    expect(v.legacy).toBe(true);
    expect(sessionBillingClaim(v)).toBeUndefined();
  });
  it("exempt hotel is never blocked, whatever its status", () => {
    for (const s of ["pending_card", "canceled", "past_due"]) {
      expect(billingView({ billing_exempt: true, billing_status: s }).access).toBe("full");
    }
  });
  it("no card yet: blocked", () => {
    const v = billingView({ billing_status: "pending_card" });
    expect(v.access).toBe("needs_card");
    expect(sessionBillingClaim(v)).toBe("blocked");
  });
  it("trial: full access with days left banner", () => {
    const v = billingView({ billing_status: "trialing", trial_ends_at: "2026-11-25T10:00:00.000Z" }, NOW);
    expect(v.access).toBe("full");
    expect(v.banner).toEqual({ kind: "trial", daysLeft: 10, endsAt: "2026-11-25T10:00:00.000Z" });
  });
  it("payment failed: still open, with the past-due banner", () => {
    const v = billingView({ billing_status: "past_due" }, NOW);
    expect(v.access).toBe("full");
    expect(v.banner).toEqual({ kind: "past_due" });
  });
  it("cancelled: open until the end of the paid time, then ended", () => {
    const h = { billing_status: "canceled", current_period_end: "2026-11-20T00:00:00.000Z" };
    expect(billingView(h, NOW).access).toBe("full");
    expect(billingView(h, NOW).banner?.kind).toBe("canceled");
    expect(billingView(h, new Date("2026-11-21T00:00:00Z")).access).toBe("ended");
    expect(billingView({ billing_status: "canceled" }, NOW).access).toBe("ended");
  });
  it("blocked sessions keep login/logout only", () => {
    expect(blockedAdminApiAllowed("/api/admin/auth")).toBe(true);
    expect(blockedAdminApiAllowed("/api/admin/auth/logout")).toBe(true);
    expect(blockedAdminApiAllowed("/api/admin/bookings")).toBe(false);
    expect(blockedAdminApiAllowed("/api/admin/authx")).toBe(false);
  });
  it("missing column errors are recognised", () => {
    expect(isMissingColumnError({ code: "42703", message: "column hotels.billing_status does not exist" })).toBe(true);
    expect(isMissingColumnError({ code: "PGRST204", message: "Could not find the 'room_count' column" })).toBe(true);
    expect(isMissingColumnError({ code: "23505", message: "duplicate key" })).toBe(false);
  });
});

describe("card on file: Paystack (cedis)", () => {
  it("starts a GH₵1 card-only check with our metadata", async () => {
    const { deps, store, paystack } = makeDeps();
    store.add({ id: "h1", billing_status: "pending_card", room_count: 4 });
    const { url } = await startCardSetup(deps, "h1", "paystack");
    expect(url).toMatch(/^https:\/\/checkout\.paystack\.test\//);
    const arg = paystack.initializeCardCheck.mock.calls[0][0];
    expect(arg.amountPesewas).toBe(100);
    expect(arg.metadata).toEqual({ purpose: "abeiku_card_check", hotel_id: "h1", tier: "small" });
    expect(arg.callbackUrl).toBe("https://abeiku.test/signup/done?provider=paystack");
    expect(store.hotels.get("h1")).toMatchObject({ billing_provider: "paystack", billing_currency: "GHS", billing_tier: "small" });
  });

  it("on return: subscription starts at trial end, card check refunded, trial begins", async () => {
    const { deps, store, paystack } = makeDeps();
    store.add({ id: "h1", billing_status: "pending_card", room_count: 8 });
    const r = await completePaystackSetup(deps, "h1", "abk_ref");
    expect(r.trialEndsAt).toBe("2026-12-15T10:00:00.000Z");
    expect(paystack.createSubscription).toHaveBeenCalledWith({
      customer: "CUS_1",
      plan: "PLN_large",
      authorization: "AUTH_1",
      startDate: "2026-12-15T10:00:00.000Z",
    });
    expect(paystack.refund).toHaveBeenCalledWith("abk_ref");
    expect(store.hotels.get("h1")).toMatchObject({
      billing_status: "trialing",
      billing_tier: "large",
      billing_customer_id: "CUS_1",
      billing_subscription_id: "SUB_1",
      trial_ends_at: "2026-12-15T10:00:00.000Z",
    });
    // Second call (webhook, reload) changes nothing.
    await completePaystackSetup(deps, "h1", "abk_ref");
    expect(paystack.createSubscription).toHaveBeenCalledTimes(1);
  });

  it("a failed refund does not undo the sign-up", async () => {
    const { deps, store, paystack } = makeDeps();
    paystack.refund.mockRejectedValueOnce(new Error("refund down"));
    store.add({ id: "h1", billing_status: "pending_card", room_count: 2 });
    await completePaystackSetup(deps, "h1", "ref");
    expect(store.hotels.get("h1")?.billing_status).toBe("trialing");
  });

  it("refuses someone else's reference, a failed charge, or a card that can't be reused", async () => {
    const cases = [
      { metadata: { purpose: "abeiku_card_check", hotel_id: "other" } },
      { status: "failed" },
      { authorization: { authorization_code: "A", reusable: false, channel: "card" } },
      { authorization: { authorization_code: "A", reusable: true, channel: "mobile_money" } },
    ];
    for (const tx of cases) {
      const { deps, store, paystack } = makeDeps();
      paystack.verifyTransaction.mockResolvedValueOnce({ ...(await paystack.verifyTransaction("x")), ...tx });
      store.add({ id: "h1", billing_status: "pending_card", room_count: 2 });
      await expect(completePaystackSetup(deps, "h1", "ref")).rejects.toBeInstanceOf(BillingError);
      expect(paystack.createSubscription).not.toHaveBeenCalled();
      expect(store.hotels.get("h1")?.billing_status).toBe("pending_card");
    }
  });

  it("missing plan ids: clear 503, nothing sent to Paystack", async () => {
    const { deps, store, paystack } = makeDeps({ planIds: { paystack: { small: null, large: null }, stripe: PLAN_IDS.stripe } });
    store.add({ id: "h1", billing_status: "pending_card", room_count: 2 });
    await expect(startCardSetup(deps, "h1", "paystack")).rejects.toMatchObject({ status: 503 });
    expect(paystack.initializeCardCheck).not.toHaveBeenCalled();
  });

  it("will not start a card step for a hotel that already has one", async () => {
    const { deps, store } = makeDeps();
    store.add({ id: "h1", billing_status: "trialing", room_count: 2 });
    await expect(startCardSetup(deps, "h1", "stripe")).rejects.toMatchObject({ status: 409 });
  });

  it("resumes a card step the owner never came back from", async () => {
    const { deps, store } = makeDeps();
    store.add({ id: "h1", billing_status: "pending_card", room_count: 2, billing_provider: "paystack", billing_setup_ref: "abk_x" });
    expect(await resumePendingSetup(deps, "h1")).toBe(true);
    expect(store.hotels.get("h1")?.billing_status).toBe("trialing");
  });
});

describe("card on file: Stripe (dollars)", () => {
  it("Checkout in subscription mode with a 30-day trial, card always collected", async () => {
    const { deps, store, stripe } = makeDeps();
    store.add({ id: "h1", billing_status: "pending_card", room_count: 6 });
    const { url } = await startCardSetup(deps, "h1", "stripe");
    expect(url).toBe("https://checkout.stripe.test/cs_1");
    expect(stripe.createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({ price: "price_large", hotelId: "h1", trialDays: 30, email: "owner@test.gh" })
    );
    expect(store.hotels.get("h1")).toMatchObject({ billing_provider: "stripe", billing_currency: "USD", billing_setup_ref: "cs_1" });
  });

  it("on return: records customer and subscription, trial from Stripe", async () => {
    const { deps, store } = makeDeps();
    store.add({ id: "h1", billing_status: "pending_card", room_count: 2 });
    await completeStripeSetup(deps, "h1", "cs_1");
    expect(store.hotels.get("h1")).toMatchObject({
      billing_status: "trialing",
      billing_customer_id: "cus_1",
      billing_subscription_id: "sub_1",
      trial_ends_at: "2026-12-15T10:00:00.000Z",
      billing_tier: "small",
      billing_setup_ref: null,
    });
  });

  it("refuses another hotel's checkout or an unfinished one", async () => {
    const { deps, store, stripe } = makeDeps();
    store.add({ id: "h1", billing_status: "pending_card", room_count: 2 });
    stripe.retrieveCheckoutSession.mockResolvedValueOnce({ ...(await stripe.retrieveCheckoutSession("cs")), client_reference_id: "h2" });
    await expect(completeStripeSetup(deps, "h1", "cs")).rejects.toMatchObject({ status: 403 });
    stripe.retrieveCheckoutSession.mockResolvedValueOnce({ ...(await stripe.retrieveCheckoutSession("cs")), status: "open" });
    await expect(completeStripeSetup(deps, "h1", "cs")).rejects.toMatchObject({ status: 402 });
    expect(store.hotels.get("h1")?.billing_status).toBe("pending_card");
  });
});

describe("cancel", () => {
  it("Stripe in trial: deleted now (nothing charged), access to trial end", async () => {
    const { deps, store, stripe } = makeDeps();
    store.add({ id: "h1", billing_status: "trialing", billing_provider: "stripe", billing_subscription_id: "sub_1", trial_ends_at: "2026-12-15T10:00:00.000Z", current_period_end: "2026-12-15T10:00:00.000Z" });
    const r = await cancelBilling(deps, "h1");
    expect(stripe.cancelSubscription).toHaveBeenCalledWith("sub_1", false);
    expect(r.accessUntil).toBe("2026-12-15T10:00:00.000Z");
    expect(store.hotels.get("h1")?.billing_status).toBe("canceled");
  });
  it("Stripe after trial: cancel at period end", async () => {
    const { deps, store, stripe } = makeDeps();
    store.add({ id: "h1", billing_status: "active", billing_provider: "stripe", billing_subscription_id: "sub_1" });
    await cancelBilling(deps, "h1");
    expect(stripe.cancelSubscription).toHaveBeenCalledWith("sub_1", true);
  });
  it("Paystack: subscription disabled with its email token", async () => {
    const { deps, store, paystack } = makeDeps();
    store.add({ id: "h1", billing_status: "trialing", billing_provider: "paystack", billing_subscription_id: "SUB_9" });
    const r = await cancelBilling(deps, "h1");
    expect(paystack.disableSubscription).toHaveBeenCalledWith("SUB_9", "tok_old");
    expect(r.accessUntil).toBe("2026-12-15T10:00:00.000Z");
  });
  it("exempt or not billed: nothing to cancel", async () => {
    const { deps, store } = makeDeps();
    store.add({ id: "h1", billing_exempt: true, billing_status: "active" });
    await expect(cancelBilling(deps, "h1")).rejects.toMatchObject({ status: 409 });
  });
});

describe("room count changes the tier from the next charge", () => {
  it("Stripe: price swapped without proration", async () => {
    const { deps, store, stripe } = makeDeps();
    store.add({ id: "h1", billing_status: "active", billing_provider: "stripe", billing_subscription_id: "sub_1", billing_tier: "small", room_count: 4 });
    const r = await changeRoomCount(deps, "h1", 9);
    expect(r).toEqual({ tier: "large", changed: true });
    expect(stripe.changePrice).toHaveBeenCalledWith("sub_1", "si_1", "price_large");
    expect(store.hotels.get("h1")).toMatchObject({ room_count: 9, billing_tier: "large" });
  });
  it("Paystack: new subscription from the next payment date, old one disabled after", async () => {
    const { deps, store, paystack } = makeDeps();
    store.add({ id: "h1", billing_status: "trialing", billing_provider: "paystack", billing_subscription_id: "SUB_old", billing_tier: "small", room_count: 3 });
    await changeRoomCount(deps, "h1", 12);
    expect(paystack.createSubscription).toHaveBeenCalledWith({ customer: "CUS_1", plan: "PLN_large", authorization: "AUTH_1", startDate: "2026-12-15T10:00:00.000Z" });
    expect(paystack.disableSubscription).toHaveBeenCalledWith("SUB_old", "tok_old");
    expect(store.hotels.get("h1")).toMatchObject({ billing_subscription_id: "SUB_1", billing_tier: "large", room_count: 12 });
  });
  it("same tier: only the room count changes", async () => {
    const { deps, store, stripe } = makeDeps();
    store.add({ id: "h1", billing_status: "active", billing_provider: "stripe", billing_subscription_id: "sub_1", billing_tier: "small", room_count: 2 });
    expect(await changeRoomCount(deps, "h1", 5)).toEqual({ tier: "small", changed: false });
    expect(stripe.changePrice).not.toHaveBeenCalled();
  });
});

describe("sign-up form checks", () => {
  it("account", () => {
    expect(parseAccount({ hotelName: " Busua Inn ", email: "A@B.com", password: "longenough", acceptTerms: true })).toEqual({
      ok: true,
      value: { hotelName: "Busua Inn", email: "a@b.com", password: "longenough" },
    });
    expect(parseAccount({ hotelName: "X", email: "a@b.com", password: "longenough", acceptTerms: true }).ok).toBe(false);
    expect(parseAccount({ hotelName: "Inn", email: "nope", password: "longenough", acceptTerms: true }).ok).toBe(false);
    expect(parseAccount({ hotelName: "Inn", email: "a@b.com", password: "short", acceptTerms: true }).ok).toBe(false);
  });
  it("account: the Terms box must be ticked (a real true only)", () => {
    const base = { hotelName: "Inn", email: "a@b.com", password: "longenough" };
    for (const acceptTerms of [undefined, null, false, "true", "yes", "on", 1]) {
      expect(parseAccount({ ...base, acceptTerms })).toEqual({ ok: false, error: TERMS_REQUIRED_ERROR });
    }
    // Field errors come first, so the owner fixes the form top to bottom.
    expect(parseAccount({ ...base, email: "nope" })).toEqual({ ok: false, error: "Enter a valid email address." });
    expect(parseAccount({ ...base, acceptTerms: true }).ok).toBe(true);
  });
  it("hotel details", () => {
    expect(parseHotelDetails({ town: "Busua", rooms: "6", contactEmail: "info@inn.gh" })).toEqual({
      ok: true,
      value: { town: "Busua", rooms: 6, contactEmail: "info@inn.gh" },
    });
    expect(parseHotelDetails({ town: "Busua", rooms: "0", contactEmail: "info@inn.gh" }).ok).toBe(false);
  });
  it("calendar links are optional, must be https, webcal is accepted", () => {
    expect(parseCalendarLinks({})).toEqual({ ok: true, value: { airbnb: null, booking: null, vrbo: null, google: null } });
    const r = parseCalendarLinks({ airbnb: "webcal://www.airbnb.com/calendar/ical/1.ics?s=x", google: "abc@group.calendar.google.com" });
    expect(r).toMatchObject({ ok: true, value: { airbnb: "https://www.airbnb.com/calendar/ical/1.ics?s=x", google: "abc@group.calendar.google.com" } });
    expect(parseCalendarLinks({ booking: "http://x.com/a.ics" }).ok).toBe(false);
    expect(parseCalendarLinks({ vrbo: "not a link" }).ok).toBe(false);
    expect(parseCalendarLinks({ google: "my calendar" }).ok).toBe(false);
  });
  it("slug", () => {
    expect(slugify("Busua Beach Résort!")).toBe("busua-beach-resort");
    expect(slugify("***")).toBe("hotel");
  });
});
