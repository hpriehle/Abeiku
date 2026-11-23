// Gap #14: platform admin trial extension, and what suspend/exempt do to access.

import { describe, expect, it, vi } from "vitest";
import { adminRedirect, billingView, LOCKED_ADMIN_PAGE } from "./access";
import { extendTrial, extendedTrialEnd, BillingError } from "./flow";
import { makeDeps, NOW } from "./fakes.test-helper";
import { runDailyBillingCheck } from "./notices";

vi.mock("@/lib/ops/alerts", async (orig) => ({ ...(await orig<object>()), opsAlert: vi.fn(async () => "sent") }));

const DAY = 86_400_000;

describe("extendedTrialEnd", () => {
  it("adds days to a future trial end", () => {
    expect(extendedTrialEnd("2026-11-20T10:00:00.000Z", 7, NOW)).toBe("2026-11-27T10:00:00.000Z");
  });
  it("counts from now when the trial end is past, missing or invalid", () => {
    const want = new Date(NOW.getTime() + 14 * DAY).toISOString();
    expect(extendedTrialEnd("2026-11-01T00:00:00.000Z", 14, NOW)).toBe(want);
    expect(extendedTrialEnd(null, 14, NOW)).toBe(want);
    expect(extendedTrialEnd("garbage", 14, NOW)).toBe(want);
  });
});

describe("extendTrial", () => {
  const END = "2026-12-15T10:00:00.000Z";
  const NEW_END = "2026-12-29T10:00:00.000Z";

  it("Stripe: moves the subscription's trial end, then the hotel's", async () => {
    const { deps, store, stripe } = makeDeps();
    store.add({ id: "h1", billing_status: "trialing", billing_provider: "stripe", billing_subscription_id: "sub_1", trial_ends_at: END });
    expect(await extendTrial(deps, "h1", 14)).toEqual({ trialEndsAt: NEW_END });
    expect(stripe.extendTrial).toHaveBeenCalledWith("sub_1", Date.parse(NEW_END) / 1000);
    const h = await store.getHotel("h1");
    expect([h?.trial_ends_at, h?.current_period_end]).toEqual([NEW_END, NEW_END]);
  });

  it("Paystack: new subscription from the new end on the same card, old one disabled", async () => {
    const { deps, store, paystack } = makeDeps();
    store.add({ id: "h1", billing_status: "trialing", billing_provider: "paystack", billing_subscription_id: "SUB_old", trial_ends_at: END });
    await extendTrial(deps, "h1", 14);
    expect(paystack.createSubscription).toHaveBeenCalledWith({ customer: "CUS_1", plan: "PLN_small", authorization: "AUTH_1", startDate: NEW_END });
    expect(paystack.disableSubscription).toHaveBeenCalledWith("SUB_old", "tok_old");
    const h = await store.getHotel("h1");
    expect([h?.billing_subscription_id, h?.trial_ends_at]).toEqual(["SUB_1", NEW_END]);
  });

  it("only for a hotel in its trial", async () => {
    const { deps, store, stripe } = makeDeps();
    store.add({ id: "h1", billing_status: "active", billing_provider: "stripe", billing_subscription_id: "sub_1" });
    await expect(extendTrial(deps, "h1", 7)).rejects.toBeInstanceOf(BillingError);
    expect(stripe.extendTrial).not.toHaveBeenCalled();
    expect(store.updates).toEqual([]);
  });
});

describe("suspend and exempt in access.ts", () => {
  it("suspended: locked to the Plan page, even when exempt or legacy, with no payment banner", () => {
    for (const h of [{ billing_status: "active" }, { billing_exempt: true, billing_status: "trialing" }, {}]) {
      const v = billingView({ ...h, suspended_at: NOW.toISOString() }, NOW);
      expect([v.access, v.suspended, v.banner]).toEqual(["locked", true, null]);
      expect(adminRedirect(v, "/admin/dashboard")).toBe(LOCKED_ADMIN_PAGE);
      expect(adminRedirect(v, LOCKED_ADMIN_PAGE)).toBeNull();
    }
  });

  it("unsuspended (null): back to the normal state", () => {
    const v = billingView({ billing_status: "active", suspended_at: null }, NOW);
    expect([v.access, v.suspended]).toEqual(["full", false]);
  });

  it("exempt: full access even after the grace period ran out", () => {
    const past_due_since = new Date(NOW.getTime() - 30 * DAY).toISOString();
    expect(billingView({ billing_status: "past_due", past_due_since }, NOW).access).toBe("locked");
    expect(billingView({ billing_status: "past_due", past_due_since, billing_exempt: true }, NOW).access).toBe("full");
  });

  it("the daily check doesn't report a suspended (not past due) hotel as unpaid", async () => {
    const { deps, store } = makeDeps();
    const send = vi.fn(async () => ({ success: true }));
    store.add({ id: "h1", billing_status: "canceled", current_period_end: "2026-12-01T00:00:00.000Z", suspended_at: NOW.toISOString() });
    expect((await runDailyBillingCheck({ ...deps, send })).locked).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });
});
