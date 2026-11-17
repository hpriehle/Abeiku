// The billing steps: put a card on file (Paystack or Stripe), finish after the provider sends
// the owner back, cancel, and change room count (tier). Everything external comes in `deps`.
//
// Paystack (cedis): Paystack has no free-trial switch. Standard pattern, from its docs on
// subscriptions (start_date) and recurring charges:
//   1. charge a small card check (GH₵1 by default) on a card-only checkout page;
//   2. verify it and keep the reusable authorization;
//   3. create the subscription with start_date = trial end, so the first real charge is then;
//   4. refund the card check in full.
// Stripe (dollars): Checkout in subscription mode, trial_period_days=30,
// payment_method_collection=always. Stripe charges when the trial ends.

import { TRIAL_DAYS } from "@/lib/site";
import { billingView } from "./access";
import {
  currencyFor,
  tierForRooms,
  trialEndsAt,
  type BillingProvider,
  type PlanIds,
  type Tier,
} from "./plans";
import type { PaystackBillingApi, StripeBillingApi, StripeSubscription } from "./providers";
import type { BillingHotel, BillingPatch, BillingStore } from "./store";
import type { SendEmail } from "./emails";
import { applyBillingPatch } from "./notices";

export interface BillingDeps {
  store: BillingStore;
  paystack: PaystackBillingApi;
  stripe: StripeBillingApi;
  planIds: PlanIds;
  /** Public base URL, no trailing slash (return links from the card pages). */
  appUrl: string;
  now?: () => Date;
  /** Card check amount in pesewas (default 100 = GH₵1). */
  cardCheckPesewas?: number;
  /** Billing emails (sendEmail in production; absent = no emails, e.g. most tests). */
  send?: SendEmail;
  /** Platform note address (default PLATFORM_ALERT_EMAIL or Harrison's). */
  platformEmail?: string;
}

/** A hotel that already had a trial (it has a trial end date) starts again without one. */
export function trialUsed(hotel: Pick<BillingHotel, "trial_ends_at">): boolean {
  return !!hotel.trial_ends_at;
}

export class BillingError extends Error {
  constructor(
    message: string,
    /** Safe to show the owner. */
    public readonly userMessage: string,
    public readonly status = 400
  ) {
    super(message);
  }
}

export const CARD_CHECK_PURPOSE = "abeiku_card_check";

const nowOf = (deps: BillingDeps) => (deps.now ? deps.now() : new Date());
const isoFromUnix = (s: number | null) => (s ? new Date(s * 1000).toISOString() : null);

function planFor(deps: BillingDeps, provider: BillingProvider, tier: Tier): string {
  const id = deps.planIds[provider][tier];
  if (!id) {
    throw new BillingError(
      `missing ${provider} plan id for ${tier}`,
      "Card sign-up is not set up yet. Please try again later or email us.",
      503
    );
  }
  return id;
}

async function mustGet(deps: BillingDeps, hotelId: string): Promise<BillingHotel> {
  const h = await deps.store.getHotel(hotelId);
  if (!h) throw new BillingError("hotel not found", "We could not find your hotel. Please log in again.", 404);
  return h;
}

/** Step 4: send the owner to the provider's card page. Returns the URL to redirect to. */
export async function startCardSetup(
  deps: BillingDeps,
  hotelId: string,
  provider: BillingProvider
): Promise<{ url: string }> {
  const hotel = await mustGet(deps, hotelId);
  const view = billingView(hotel, nowOf(deps));
  if (view.status !== "pending_card") {
    throw new BillingError(`hotel ${hotelId} is ${view.status}`, "Your card is already on file.", 409);
  }
  if (!hotel.room_count) {
    throw new BillingError("no room count", "Please enter your number of rooms first.");
  }
  const email = hotel.contact_email;
  if (!email) throw new BillingError("no contact email", "Please enter a contact email first.");

  const tier = tierForRooms(hotel.room_count);
  const plan = planFor(deps, provider, tier);
  const trialDays = trialUsed(hotel) ? 0 : TRIAL_DAYS;

  if (provider === "paystack") {
    const reference = `abk_${hotelId.slice(0, 8)}_${nowOf(deps).getTime()}`;
    const res = await deps.paystack.initializeCardCheck({
      email,
      amountPesewas: deps.cardCheckPesewas ?? 100,
      reference,
      callbackUrl: `${deps.appUrl}/signup/done?provider=paystack`,
      metadata: { purpose: CARD_CHECK_PURPOSE, hotel_id: hotelId, tier, trial: trialDays > 0 },
    });
    await deps.store.update(hotelId, {
      billing_provider: "paystack",
      billing_currency: "GHS",
      billing_tier: tier,
      billing_setup_ref: res.reference,
    });
    return { url: res.authorizationUrl };
  }

  const session = await deps.stripe.createCheckoutSession({
    price: plan,
    hotelId,
    email,
    trialDays,
    successUrl: `${deps.appUrl}/signup/done?provider=stripe&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${deps.appUrl}/signup?step=plan`,
  });
  await deps.store.update(hotelId, {
    billing_provider: "stripe",
    billing_currency: "USD",
    billing_tier: tier,
    billing_setup_ref: session.id,
  });
  return { url: session.url };
}

export type SetupResult = { ok: true; trialEndsAt: string | null; alreadyDone?: boolean };

/**
 * Paystack return: verify the card check, start the subscription at trial end, refund the check.
 * Safe to call twice: once the hotel left pending_card it does nothing.
 */
export async function completePaystackSetup(deps: BillingDeps, hotelId: string, reference: string): Promise<SetupResult> {
  const hotel = await mustGet(deps, hotelId);
  if (hotel.billing_status !== "pending_card") return { ok: true, trialEndsAt: hotel.billing_status === "trialing" ? (hotel.trial_ends_at ?? null) : null, alreadyDone: true };

  const tx = await deps.paystack.verifyTransaction(reference);
  const meta = tx.metadata ?? {};
  if (meta.hotel_id !== hotelId || meta.purpose !== CARD_CHECK_PURPOSE) {
    throw new BillingError(`reference ${reference} is not this hotel's card check`, "That payment does not belong to your account.", 403);
  }
  if (tx.status !== "success") {
    throw new BillingError(`card check status ${tx.status}`, "Your card was not added. Please try again.", 402);
  }
  if (!tx.authorization?.reusable || tx.authorization.channel !== "card") {
    throw new BillingError("authorization not reusable", "That card can't be used for monthly payments. Please try another card.", 402);
  }

  const tier = tierForRooms(hotel.room_count ?? 1);
  const plan = planFor(deps, "paystack", tier);
  // Restart after a cancel: no second trial, the first charge is now.
  const noTrial = trialUsed(hotel);
  const now = nowOf(deps).toISOString();
  const trialEnd = noTrial ? null : trialEndsAt(nowOf(deps)).toISOString();

  const sub = await deps.paystack.createSubscription({
    customer: tx.customer.customer_code,
    plan,
    authorization: tx.authorization.authorization_code,
    startDate: trialEnd ?? now,
  });

  await applyBillingPatch(deps, hotel, {
    billing_status: noTrial ? "active" : "trialing",
    billing_provider: "paystack",
    billing_currency: "GHS",
    billing_tier: tier,
    billing_customer_id: tx.customer.customer_code,
    billing_subscription_id: sub.subscription_code,
    ...(trialEnd ? { trial_ends_at: trialEnd } : {}),
    current_period_end: trialEnd ?? sub.next_payment_date ?? now,
    billing_setup_ref: null,
  });

  // The card check is only there to save the card: give it back. A failed refund must not undo
  // the sign-up; it is logged so it can be refunded by hand in the Paystack dashboard.
  try {
    await deps.paystack.refund(reference);
  } catch (err) {
    console.error(`[billing] card check refund failed for ${reference}:`, err);
  }

  return { ok: true, trialEndsAt: trialEnd };
}

function patchFromStripe(sub: StripeSubscription, deps: BillingDeps): BillingPatch {
  const patch: BillingPatch = {
    billing_provider: "stripe",
    billing_currency: currencyFor("stripe"),
    billing_customer_id: sub.customer || undefined,
    billing_subscription_id: sub.id,
  };
  const status = stripeStatus(sub);
  if (status) patch.billing_status = status;
  if (sub.trial_end) patch.trial_ends_at = isoFromUnix(sub.trial_end);
  const periodEnd = sub.cancel_at ?? sub.current_period_end;
  if (periodEnd) patch.current_period_end = isoFromUnix(periodEnd);
  const tier = sub.item ? (deps.planIds.stripe.small === sub.item.price ? "small" : deps.planIds.stripe.large === sub.item.price ? "large" : null) : null;
  if (tier) patch.billing_tier = tier;
  return patch;
}

/** Stripe subscription status in our words (null: leave the hotel's status as it is). */
export function stripeStatus(sub: Pick<StripeSubscription, "status" | "cancel_at_period_end">): BillingPatch["billing_status"] | null {
  if (sub.status === "canceled" || sub.status === "incomplete_expired") return "canceled";
  if (sub.cancel_at_period_end) return "canceled";
  if (sub.status === "trialing") return "trialing";
  if (sub.status === "active") return "active";
  if (sub.status === "past_due" || sub.status === "unpaid") return "past_due";
  return null; // incomplete, paused: wait for the next event
}

/** Stripe return (and checkout.session.completed): record the customer and subscription. */
export async function completeStripeSetup(deps: BillingDeps, hotelId: string, sessionId: string): Promise<SetupResult> {
  const hotel = await mustGet(deps, hotelId);
  if (hotel.billing_status !== "pending_card") return { ok: true, trialEndsAt: hotel.billing_status === "trialing" ? (hotel.trial_ends_at ?? null) : null, alreadyDone: true };

  const session = await deps.stripe.retrieveCheckoutSession(sessionId);
  if (session.client_reference_id !== hotelId) {
    throw new BillingError(`session ${sessionId} is not this hotel's`, "That sign-up does not belong to your account.", 403);
  }
  if (session.status !== "complete" || !session.subscription) {
    throw new BillingError(`checkout status ${session.status}`, "Your card was not added. Please try again.", 402);
  }
  const sub = await deps.stripe.retrieveSubscription(session.subscription);
  const patch = { ...patchFromStripe(sub, deps), billing_setup_ref: null };
  if (!patch.billing_status) patch.billing_status = "trialing";
  await applyBillingPatch(deps, hotel, patch);
  return { ok: true, trialEndsAt: patch.billing_status === "trialing" ? (patch.trial_ends_at ?? null) : null };
}

/** Finish whichever card step was started, if the owner never came back from the card page. */
export async function resumePendingSetup(deps: BillingDeps, hotelId: string): Promise<boolean> {
  const hotel = await deps.store.getHotel(hotelId);
  if (!hotel || hotel.billing_status !== "pending_card" || !hotel.billing_setup_ref) return false;
  try {
    if (hotel.billing_provider === "paystack") await completePaystackSetup(deps, hotelId, hotel.billing_setup_ref);
    else if (hotel.billing_provider === "stripe") await completeStripeSetup(deps, hotelId, hotel.billing_setup_ref);
    else return false;
    return true;
  } catch {
    return false; // not paid yet, or abandoned: the owner sees the card step again
  }
}

/**
 * Cancel. In the trial: nothing is ever charged (Stripe subscription deleted now; Paystack
 * subscription disabled before its start date). After the trial: no further charges; access
 * stays until the end of the month already paid.
 */
export async function cancelBilling(deps: BillingDeps, hotelId: string): Promise<{ accessUntil: string | null }> {
  const hotel = await mustGet(deps, hotelId);
  const view = billingView(hotel, nowOf(deps));
  if (view.exempt || view.legacy) throw new BillingError("not on billing", "This account has no plan to cancel.", 409);
  if (view.status === "canceled") return { accessUntil: hotel.current_period_end ?? hotel.trial_ends_at ?? null };

  const subId = hotel.billing_subscription_id;
  let accessUntil: string | null = hotel.current_period_end ?? hotel.trial_ends_at ?? null;

  if (subId && hotel.billing_provider === "stripe") {
    const inTrial = view.status === "trialing";
    const sub = await deps.stripe.cancelSubscription(subId, !inTrial);
    if (!inTrial && (sub.cancel_at ?? sub.current_period_end)) accessUntil = isoFromUnix(sub.cancel_at ?? sub.current_period_end);
  } else if (subId && hotel.billing_provider === "paystack") {
    const sub = await deps.paystack.fetchSubscription(subId);
    await deps.paystack.disableSubscription(subId, sub.email_token);
    if (sub.next_payment_date) accessUntil = sub.next_payment_date;
  }

  // pending_card: nothing at the provider yet, the hotel simply never starts.
  await applyBillingPatch(deps, hotel, {
    billing_status: "canceled",
    current_period_end: view.status === "pending_card" ? nowOf(deps).toISOString() : accessUntil,
  });
  return { accessUntil: view.status === "pending_card" ? null : accessUntil };
}

/**
 * New room count. If the tier changes, the new price starts with the next charge
 * (Stripe: price swap without proration; Paystack: new subscription starting on the old one's
 * next payment date, same card, then the old one is disabled).
 */
export async function changeRoomCount(
  deps: BillingDeps,
  hotelId: string,
  rooms: number
): Promise<{ tier: Tier; changed: boolean }> {
  const hotel = await mustGet(deps, hotelId);
  const tier = tierForRooms(rooms);
  const view = billingView(hotel, nowOf(deps));
  const oldTier = view.tier;
  const live = !view.exempt && !view.legacy && (view.status === "trialing" || view.status === "active" || view.status === "past_due");

  if (!live || oldTier === tier || !hotel.billing_subscription_id) {
    await deps.store.update(hotelId, { room_count: rooms, ...(view.exempt || view.legacy ? {} : { billing_tier: tier }) });
    return { tier, changed: oldTier !== tier };
  }

  const plan = planFor(deps, hotel.billing_provider as BillingProvider, tier);
  if (hotel.billing_provider === "stripe") {
    const sub = await deps.stripe.retrieveSubscription(hotel.billing_subscription_id);
    if (!sub.item) throw new BillingError("subscription has no item", "We could not change your plan. Please email us.", 500);
    await deps.stripe.changePrice(sub.id, sub.item.id, plan);
    await deps.store.update(hotelId, { room_count: rooms, billing_tier: tier });
  } else {
    const old = await deps.paystack.fetchSubscription(hotel.billing_subscription_id);
    if (!old.authorization_code || !old.customer_code) {
      throw new BillingError("old subscription lacks card", "We could not change your plan. Please email us.", 500);
    }
    const start = old.next_payment_date ?? hotel.current_period_end ?? trialEndsAt(nowOf(deps)).toISOString();
    const next = await deps.paystack.createSubscription({
      customer: old.customer_code,
      plan,
      authorization: old.authorization_code,
      startDate: start,
    });
    // Point the hotel at the new subscription first, so the old one's "disabled" webhook
    // no longer matches it and can't mark the hotel cancelled.
    await deps.store.update(hotelId, { room_count: rooms, billing_tier: tier, billing_subscription_id: next.subscription_code });
    await deps.paystack.disableSubscription(old.subscription_code, old.email_token);
  }
  return { tier, changed: true };
}

export { patchFromStripe };

/**
 * "Start again" after a plan ended: back to the card step, without a second free trial
 * (startCardSetup sees the old trial end date). Only for a cancelled plan whose time is over.
 */
export async function restartBilling(deps: BillingDeps, hotelId: string): Promise<void> {
  const hotel = await mustGet(deps, hotelId);
  const view = billingView(hotel, nowOf(deps));
  if (view.access !== "ended") {
    throw new BillingError(`hotel ${hotelId} is ${view.status}/${view.access}`, "Your plan has not ended, so there is nothing to restart.", 409);
  }
  await applyBillingPatch(deps, hotel, {
    billing_status: "pending_card",
    billing_subscription_id: null,
    billing_setup_ref: null,
    current_period_end: null,
    // trial_ends_at stays: a hotel that had a trial restarts without one. A hotel that cancelled
    // before ever adding a card has none, so it still gets its free trial.
  });
}

/**
 * Where the owner changes their card (and can cancel): Stripe Billing Portal for the customer,
 * or Paystack's hosted "manage subscription" page.
 */
export async function cardUpdateUrl(deps: BillingDeps, hotelId: string): Promise<string> {
  const hotel = await mustGet(deps, hotelId);
  const view = billingView(hotel, nowOf(deps));
  if (view.exempt || view.legacy) throw new BillingError("not on billing", "This account is not billed, so there is no card to change.", 409);
  if (hotel.billing_provider === "stripe") {
    if (!hotel.billing_customer_id) throw new BillingError("no stripe customer", "We have no card on file for you yet.", 409);
    return deps.stripe.createPortalSession(hotel.billing_customer_id, `${deps.appUrl}/admin/plan`);
  }
  if (hotel.billing_provider === "paystack") {
    if (!hotel.billing_subscription_id) throw new BillingError("no paystack subscription", "We have no card on file for you yet.", 409);
    return deps.paystack.manageLink(hotel.billing_subscription_id);
  }
  throw new BillingError("no provider", "We have no card on file for you yet.", 409);
}
