// Abeiku's own subscription for hotels (L2). Pure: no env reads except planIdsFromEnv, no I/O.
//
// Two tiers, priced by room count: up to 5 rooms "small", 6 or more "large".
// Each tier exists in cedis (Paystack plan) and dollars (Stripe price).

import { PLANS, TRIAL_DAYS } from "@/lib/site";

export type Tier = "small" | "large";
export type BillingProvider = "paystack" | "stripe";
export type BillingCurrency = "GHS" | "USD";

export const SMALL_MAX_ROOMS = 5;
export const MAX_ROOMS = 500;

export function tierForRooms(rooms: number): Tier {
  return rooms <= SMALL_MAX_ROOMS ? "small" : "large";
}

/** A whole number of rooms from 1 to MAX_ROOMS, or null. */
export function parseRoomCount(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value.trim()) : value;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > MAX_ROOMS) return null;
  return n;
}

export function currencyFor(provider: BillingProvider): BillingCurrency {
  return provider === "paystack" ? "GHS" : "USD";
}

/** Monthly price in whole cedis or dollars, from the same table the landing page shows. */
export function monthlyPrice(tier: Tier, currency: BillingCurrency): number {
  const plan = tier === "small" ? PLANS[0] : PLANS[1];
  return currency === "GHS" ? plan.ghs : plan.usd;
}

export function formatPrice(tier: Tier, currency: BillingCurrency): string {
  const amount = monthlyPrice(tier, currency);
  return currency === "GHS" ? `GH₵${amount}` : `$${amount}`;
}

export function tierLabel(tier: Tier): string {
  return tier === "small" ? PLANS[0].name : PLANS[1].name;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** First charge date: exactly TRIAL_DAYS after sign-up (same time of day, UTC). */
export function trialEndsAt(start: Date, days = TRIAL_DAYS): Date {
  return new Date(start.getTime() + days * DAY_MS);
}

/** Whole days left until `end`, rounded up, never below 0. */
export function daysLeft(end: Date | string | null | undefined, now: Date = new Date()): number {
  if (!end) return 0;
  const t = typeof end === "string" ? Date.parse(end) : end.getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.ceil((t - now.getTime()) / DAY_MS));
}

export interface PlanIds {
  paystack: Record<Tier, string | null>;
  stripe: Record<Tier, string | null>;
}

export function planIdsFromEnv(env: NodeJS.ProcessEnv = process.env): PlanIds {
  const v = (k: string) => (env[k] ?? "").trim() || null;
  return {
    paystack: { small: v("PAYSTACK_PLAN_SMALL"), large: v("PAYSTACK_PLAN_LARGE") },
    stripe: { small: v("STRIPE_PRICE_SMALL"), large: v("STRIPE_PRICE_LARGE") },
  };
}

/** Which tier a provider's plan/price id belongs to (for webhooks), or null if it is not ours. */
export function tierForPlanId(ids: PlanIds, provider: BillingProvider, planId: string | null | undefined): Tier | null {
  if (!planId) return null;
  const p = ids[provider];
  if (p.small === planId) return "small";
  if (p.large === planId) return "large";
  return null;
}
