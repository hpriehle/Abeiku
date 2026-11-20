// In-memory store and fake Paystack/Stripe for billing tests. No network.

import { vi } from "vitest";
import type { BillingDeps } from "./flow";
import type { PlanIds } from "./plans";
import type { PaystackBillingApi, PaystackTransaction, StripeBillingApi, StripeSubscription } from "./providers";
import type { BillingHotel, BillingPatch, BillingStore } from "./store";

export class MemoryBillingStore implements BillingStore {
  hotels = new Map<string, BillingHotel>();
  events = new Set<string>();
  updates: { id: string; patch: BillingPatch }[] = [];

  add(h: Partial<BillingHotel> & { id: string }): BillingHotel {
    const row: BillingHotel = { name: "Test Hotel", slug: h.id, contact_email: "owner@test.gh", ...h };
    this.hotels.set(h.id, row);
    return row;
  }
  async getHotel(id: string) {
    const h = this.hotels.get(id);
    return h ? { ...h } : null;
  }
  async update(id: string, patch: BillingPatch) {
    const h = this.hotels.get(id);
    if (!h) throw new Error(`no hotel ${id}`);
    this.updates.push({ id, patch });
    this.hotels.set(id, { ...h, ...patch });
  }
  async findBySubscription(provider: string, sub: string) {
    return [...this.hotels.values()].find((h) => h.billing_provider === provider && h.billing_subscription_id === sub) ?? null;
  }
  async findByCustomer(provider: string, cust: string) {
    return [...this.hotels.values()].find((h) => h.billing_provider === provider && h.billing_customer_id === cust) ?? null;
  }
  async firstDelivery(provider: string, id: string) {
    const k = `${provider}:${id}`;
    if (this.events.has(k)) return false;
    this.events.add(k);
    return true;
  }
  async forgetDelivery(provider: string, id: string) {
    this.events.delete(`${provider}:${id}`);
  }
  emailKeys = new Set<string>();
  async claimEmail(key: string) {
    if (this.emailKeys.has(key)) return false;
    this.emailKeys.add(key);
    return true;
  }
  async releaseEmail(key: string) {
    this.emailKeys.delete(key);
  }
  async ownerEmail(id: string) {
    return this.hotels.get(id)?.contact_email ?? null;
  }
  async listForDailyCheck() {
    return [...this.hotels.values()].filter((h) => ["trialing", "past_due", "canceled"].includes(h.billing_status ?? ""));
  }
}

export const PLAN_IDS: PlanIds = {
  paystack: { small: "PLN_small", large: "PLN_large" },
  stripe: { small: "price_small", large: "price_large" },
};

export function fakePaystack(tx: Partial<PaystackTransaction> = {}) {
  let n = 0;
  const api = {
    initializeCardCheck: vi.fn(async ({ reference }: Parameters<PaystackBillingApi["initializeCardCheck"]>[0]) => ({
      authorizationUrl: `https://checkout.paystack.test/${reference}`,
      reference,
    })),
    verifyTransaction: vi.fn(async (reference: string): Promise<PaystackTransaction> => ({
      reference,
      status: "success",
      amount: 100,
      currency: "GHS",
      customer: { customer_code: "CUS_1", email: "owner@test.gh" },
      authorization: { authorization_code: "AUTH_1", reusable: true, channel: "card" },
      metadata: { purpose: "abeiku_card_check", hotel_id: "h1" },
      ...tx,
    })),
    createSubscription: vi.fn(async (i: { customer: string; plan: string; authorization: string; startDate: string }) => ({
      subscription_code: `SUB_${++n}`,
      email_token: `tok_${n}`,
      status: "active",
      next_payment_date: i.startDate,
      plan_code: i.plan,
      authorization_code: i.authorization,
      customer_code: i.customer,
    })),
    fetchSubscription: vi.fn(async (code: string) => ({
      subscription_code: code,
      email_token: "tok_old",
      status: "active",
      next_payment_date: "2026-12-15T10:00:00.000Z",
      plan_code: "PLN_small",
      authorization_code: "AUTH_1",
      customer_code: "CUS_1",
    })),
    disableSubscription: vi.fn(async () => {}),
    refund: vi.fn(async () => {}),
    manageLink: vi.fn(async (code: string) => `https://paystack.test/manage/${code}`),
  } satisfies PaystackBillingApi;
  return api;
}

/** Paystack reports the subscription unpaid ("attention"), as test mode does after a failed charge. */
export function paystackUnpaid(api: ReturnType<typeof fakePaystack>) {
  const real = api.fetchSubscription.getMockImplementation()!;
  api.fetchSubscription.mockImplementation(async (code: string) => ({ ...(await real(code)), status: "attention" }));
}

export function stripeSub(over: Partial<StripeSubscription> = {}): StripeSubscription {
  return {
    id: "sub_1",
    status: "trialing",
    customer: "cus_1",
    trial_end: Date.parse("2026-12-15T10:00:00Z") / 1000,
    current_period_end: Date.parse("2026-12-15T10:00:00Z") / 1000,
    cancel_at_period_end: false,
    cancel_at: null,
    item: { id: "si_1", price: "price_small" },
    metadata: { hotel_id: "h1" },
    ...over,
  };
}

export function fakeStripe(sub: StripeSubscription = stripeSub()) {
  const api = {
    createCheckoutSession: vi.fn(async (_i: Parameters<StripeBillingApi["createCheckoutSession"]>[0]) => ({ id: "cs_1", url: "https://checkout.stripe.test/cs_1" })),
    retrieveCheckoutSession: vi.fn(async (id: string) => ({
      id,
      status: "complete",
      mode: "subscription",
      client_reference_id: "h1",
      customer: "cus_1",
      subscription: "sub_1",
      metadata: { hotel_id: "h1" },
    })),
    retrieveSubscription: vi.fn(async () => sub),
    cancelSubscription: vi.fn(async (_id: string, atEnd: boolean) =>
      atEnd ? { ...sub, cancel_at_period_end: true, cancel_at: sub.current_period_end } : { ...sub, status: "canceled" }
    ),
    changePrice: vi.fn(async (_s: string, _i: string, price: string) => ({ ...sub, item: { id: "si_1", price } })),
    createPortalSession: vi.fn(async (customer: string, returnUrl: string) => `https://billing.stripe.test/${customer}?return=${encodeURIComponent(returnUrl)}`),
  } satisfies StripeBillingApi;
  return api;
}

export const NOW = new Date("2026-11-15T10:00:00.000Z");

export function makeDeps(over: Partial<BillingDeps> = {}) {
  const store = new MemoryBillingStore();
  const paystack = fakePaystack();
  const stripe = fakeStripe();
  const deps = { store, paystack, stripe, planIds: PLAN_IDS, appUrl: "https://abeiku.test", now: () => NOW, ...over };
  return { deps, store, paystack, stripe };
}
