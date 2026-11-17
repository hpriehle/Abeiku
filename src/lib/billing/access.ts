// Who may use the admin, from a hotel's billing columns. Pure.
//
// The billing columns come from docs/l2-signup/billing.sql. Before that file runs they are
// missing (undefined): such hotels, and every hotel that existed before sign-up opened
// (billing_status NULL), keep full access. Hotels with billing_exempt (Aracuya) are never gated.

import { daysLeft, type BillingCurrency, type BillingProvider, type Tier } from "./plans";

export type BillingStatus = "pending_card" | "trialing" | "active" | "past_due" | "canceled";

export const BILLING_STATUSES: BillingStatus[] = ["pending_card", "trialing", "active", "past_due", "canceled"];

/** The billing fields of a hotel row. All optional: the columns may not exist yet. */
export interface HotelBilling {
  billing_exempt?: boolean | null;
  billing_status?: string | null;
  billing_provider?: string | null;
  billing_currency?: string | null;
  billing_tier?: string | null;
  room_count?: number | null;
  trial_ends_at?: string | null;
  current_period_end?: string | null;
  billing_customer_id?: string | null;
  billing_subscription_id?: string | null;
  /** Reference of the card step in progress (to finish it if the owner never came back). */
  billing_setup_ref?: string | null;
  billing_updated_at?: string | null;
  /** When the status first became past_due (docs/go-live-l3-billing.sql). Cleared on payment. */
  past_due_since?: string | null;
}

/** Days of full access after a payment first fails; then the admin is locked to the Plan page. */
export const GRACE_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

/** When a past-due hotel gets locked: past_due_since + GRACE_DAYS. Null if unknown. */
export function graceEndsAt(pastDueSince: string | null | undefined): string | null {
  if (!pastDueSince) return null;
  const t = Date.parse(pastDueSince);
  return Number.isNaN(t) ? null : new Date(t + GRACE_DAYS * DAY_MS).toISOString();
}

export type Access =
  /** Use the admin as normal. */
  | "full"
  /** Signed up but no card yet: only the sign-up steps. */
  | "needs_card"
  /** Cancelled and the paid or trial time is over. */
  | "ended"
  /** Payment failed more than GRACE_DAYS ago: only the Plan page (to update the card). */
  | "locked";

export type Banner =
  | { kind: "trial"; daysLeft: number; endsAt: string }
  /** lockAt: the date access stops (null if unknown); locked: that date has passed. */
  | { kind: "past_due"; lockAt: string | null; locked: boolean }
  | { kind: "canceled"; daysLeft: number; endsAt: string | null }
  | null;

export interface BillingView {
  access: Access;
  exempt: boolean;
  /** Not on Abeiku billing at all (older hotel, or the SQL has not run). */
  legacy: boolean;
  status: BillingStatus | null;
  provider: BillingProvider | null;
  currency: BillingCurrency | null;
  tier: Tier | null;
  roomCount: number | null;
  trialEndsAt: string | null;
  trialDaysLeft: number;
  periodEnd: string | null;
  pastDueSince: string | null;
  /** past_due only: when access stops (or stopped). */
  lockAt: string | null;
  banner: Banner;
}

function asStatus(s: unknown): BillingStatus | null {
  return BILLING_STATUSES.includes(s as BillingStatus) ? (s as BillingStatus) : null;
}

/** When a cancelled hotel loses access: the end of the trial or of the paid month. */
function accessUntil(h: HotelBilling): string | null {
  const ends = [h.current_period_end, h.trial_ends_at].filter((d): d is string => !!d && !Number.isNaN(Date.parse(d)));
  if (!ends.length) return null;
  return ends.reduce((a, b) => (Date.parse(a) > Date.parse(b) ? a : b));
}

export function billingView(h: HotelBilling, now: Date = new Date()): BillingView {
  const status = asStatus(h.billing_status);
  const exempt = h.billing_exempt === true;
  const base = {
    exempt,
    legacy: status === null,
    status,
    provider: (h.billing_provider === "paystack" || h.billing_provider === "stripe" ? h.billing_provider : null) as BillingProvider | null,
    currency: (h.billing_currency === "GHS" || h.billing_currency === "USD" ? h.billing_currency : null) as BillingCurrency | null,
    tier: (h.billing_tier === "small" || h.billing_tier === "large" ? h.billing_tier : null) as Tier | null,
    roomCount: typeof h.room_count === "number" ? h.room_count : null,
    trialEndsAt: h.trial_ends_at ?? null,
    trialDaysLeft: daysLeft(h.trial_ends_at, now),
    periodEnd: h.current_period_end ?? null,
    pastDueSince: status === "past_due" ? (h.past_due_since ?? null) : null,
    lockAt: status === "past_due" ? graceEndsAt(h.past_due_since) : null,
  };

  if (exempt || status === null) return { ...base, access: "full", banner: null };

  switch (status) {
    case "pending_card":
      return { ...base, access: "needs_card", banner: null };
    case "trialing":
      return {
        ...base,
        access: "full",
        banner: h.trial_ends_at ? { kind: "trial", daysLeft: base.trialDaysLeft, endsAt: h.trial_ends_at } : null,
      };
    case "active":
      return { ...base, access: "full", banner: null };
    case "past_due": {
      // No past_due_since (failed before the column existed): full access until the next
      // failed charge sets it.
      const locked = !!base.lockAt && now.getTime() >= Date.parse(base.lockAt);
      return { ...base, access: locked ? "locked" : "full", banner: { kind: "past_due", lockAt: base.lockAt, locked } };
    }
    case "canceled": {
      const until = accessUntil(h);
      const left = daysLeft(until, now);
      if (!until || left <= 0) return { ...base, access: "ended", banner: null };
      return { ...base, access: "full", banner: { kind: "canceled", daysLeft: left, endsAt: until } };
    }
  }
}

/**
 * Value of the `billing` claim in the admin session: set only when the admin must be sent to the
 * sign-up steps. A locked hotel has no claim: it keeps the admin session, and the admin layout
 * (which reads the database) sends every page to /admin/plan.
 */
export function sessionBillingClaim(view: BillingView): "blocked" | undefined {
  return view.access === "full" || view.access === "locked" ? undefined : "blocked";
}

/** The only admin page a locked hotel can open: the Plan page with the "Update card" button. */
export const LOCKED_ADMIN_PAGE = "/admin/plan";

/** Header the middleware sets on /admin pages so the layout knows the path. */
export const ADMIN_PATH_HEADER = "x-abeiku-admin-path";

/** Where the admin layout sends this hotel, or null to show the page asked for. */
export function adminRedirect(view: BillingView, pathname: string | null): string | null {
  if (view.access === "needs_card" || view.access === "ended") return "/signup";
  // pathname null (header missing): show the page rather than risk a redirect loop.
  if (view.access === "locked" && pathname !== null && pathname !== LOCKED_ADMIN_PAGE) return LOCKED_ADMIN_PAGE;
  return null;
}

/** Paths a blocked admin may still use (the sign-up steps live outside /admin). */
export function blockedAdminApiAllowed(pathname: string): boolean {
  return pathname === "/api/admin/auth" || pathname.startsWith("/api/admin/auth/");
}
