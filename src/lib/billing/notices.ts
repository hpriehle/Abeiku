// What a billing state change tells the owner and the platform, and the daily billing check.
// Every billing write goes through applyBillingPatch, so past_due_since and the emails follow
// the status wherever it changes (return from the card page, webhooks, cancel, restart).

import { billingView, graceEndsAt } from "./access";
import { daysLeft } from "./plans";
import { emailOwner, formatDate, notifyPlatform, planPrice, templates, type Mail } from "./emails";
import type { BillingHotel, BillingPatch, BillingStore } from "./store";
import type { SendEmail } from "./emails";

export interface NoticeDeps {
  store: BillingStore;
  send?: SendEmail;
  platformEmail?: string;
  now?: () => Date;
}

const mailOf = (d: NoticeDeps): Mail => ({ store: d.store, send: d.send, platformEmail: d.platformEmail });
const nowOf = (d: NoticeDeps) => (d.now ? d.now() : new Date());

/**
 * past_due_since follows the status: set when it first becomes past_due, kept while it stays
 * past_due, cleared when it leaves past_due (paid again, cancelled, restarted).
 */
export function withPastDueSince(hotel: BillingHotel, patch: BillingPatch, now: Date): BillingPatch {
  const next = patch.billing_status;
  if (next === "past_due") {
    if (hotel.billing_status === "past_due" && hotel.past_due_since) return patch;
    return { ...patch, past_due_since: now.toISOString() };
  }
  if (next && (hotel.billing_status === "past_due" || hotel.past_due_since)) return { ...patch, past_due_since: null };
  return patch;
}

/** Writes the patch (with past_due_since) and sends the emails the change calls for. */
export async function applyBillingPatch(deps: NoticeDeps, hotel: BillingHotel, patch: BillingPatch): Promise<BillingPatch> {
  const full = withPastDueSince(hotel, patch, nowOf(deps));
  await deps.store.update(hotel.id, full);
  await afterBillingChange(deps, hotel, { ...hotel, ...full });
  return full;
}

/** Emails for a status change from `before` to `after`. Never throws. */
export async function afterBillingChange(deps: NoticeDeps, before: BillingHotel, after: BillingHotel): Promise<void> {
  const mail = mailOf(deps);
  const from = before.billing_status ?? null;
  const to = after.billing_status ?? null;
  if (from === to || !to) return;
  const id = after.id;
  const sub = after.billing_subscription_id ?? "none";
  const price = planPrice(after);
  try {
    if (from === "pending_card" && (to === "trialing" || to === "active")) {
      const restarted = to === "active";
      await emailOwner(
        mail,
        after,
        `trial_started:${id}:${sub}`,
        restarted ? templates.planRestarted(after, price) : templates.trialStarted(after, after.trial_ends_at ?? null, price)
      );
      await notifyPlatform(
        mail,
        restarted ? `Plan restarted: ${after.name}` : `New sign-up: ${after.name}`,
        [
          `${after.name} (${after.slug}) ${restarted ? "started their plan again (no trial)" : "added a card and started the free trial"}.`,
          `Plan: ${price ?? "unknown"} a month, ${after.billing_provider ?? "unknown provider"}.`,
          restarted ? "" : `First charge: ${formatDate(after.trial_ends_at)}.`,
        ].join("\n"),
        `trial_started:${id}:${sub}`
      );
      return;
    }

    if (to === "past_due") {
      const since = after.past_due_since ?? nowOf(deps).toISOString();
      const lockAt = graceEndsAt(since);
      // Suspended: already locked, so "pay before the lock date" would be untrue.
      if (!after.suspended_at) await emailOwner(mail, after, `payment_failed:${id}:${since}`, templates.paymentFailed(after, lockAt));
      await notifyPlatform(
        mail,
        `Payment failed: ${after.name}`,
        `${after.name} (${after.slug}) failed a payment (${price ?? "?"} a month, ${after.billing_provider ?? "?"}).\nThe admin locks on ${formatDate(lockAt)} unless they pay.`,
        `payment_failed:${id}:${since}`
      );
      return;
    }

    if (to === "canceled" && from !== "pending_card") {
      const endsAt = after.current_period_end ?? after.trial_ends_at ?? null;
      await emailOwner(mail, after, `canceled:${id}:${sub}`, templates.canceled(after, endsAt));
      await notifyPlatform(
        mail,
        `Cancelled: ${after.name}`,
        `${after.name} (${after.slug}) cancelled (was ${from ?? "?"}). Access until ${formatDate(endsAt)}.`,
        `canceled:${id}:${sub}`
      );
    }
  } catch (err) {
    console.error("[billing-notices] failed for", id, (err as Error).message);
  }
}

/** "Trial ends in 3 days" (daily check, and Stripe's trial_will_end). Once per trial end date. */
export async function sendTrialEnding(deps: NoticeDeps, hotel: BillingHotel): Promise<void> {
  if (hotel.billing_status !== "trialing" || !hotel.trial_ends_at || hotel.suspended_at) return;
  await emailOwner(
    mailOf(deps),
    hotel,
    `trial_ending:${hotel.id}:${hotel.trial_ends_at}`,
    templates.trialEndingSoon(hotel, hotel.trial_ends_at, planPrice(hotel))
  );
}

/** A payment went through: receipt to the owner, once per payment key. */
export async function sendPaymentReceived(
  deps: NoticeDeps,
  hotel: BillingHotel,
  paymentKey: string,
  amount: string | null,
  nextCharge: string | null
): Promise<void> {
  await emailOwner(mailOf(deps), hotel, `payment_received:${paymentKey}`, templates.paymentReceived(hotel, amount, nextCharge));
}

/** How many days before the end of the trial the reminder goes out. */
export const TRIAL_REMINDER_DAYS = 3;
/** Plans that ended longer ago than this are not reported (no flood on the first run). */
const ENDED_LOOKBACK_DAYS = 7;

export interface DailyResult {
  checked: number;
  trialReminders: number;
  ended: number;
  locked: number;
}

/**
 * Once a day: trial-ending reminders (trial ends within 3 days), and platform notes for plans
 * that ended and for hotels that just got locked after the grace period.
 */
export async function runDailyBillingCheck(deps: NoticeDeps): Promise<DailyResult> {
  const now = nowOf(deps);
  const mail = mailOf(deps);
  const hotels = await deps.store.listForDailyCheck();
  const result: DailyResult = { checked: hotels.length, trialReminders: 0, ended: 0, locked: 0 };

  for (const h of hotels) {
    if (h.billing_exempt) continue;
    try {
      const v = billingView(h, now);
      if (v.status === "trialing" && h.trial_ends_at) {
        if (v.suspended) continue;
        const left = daysLeft(h.trial_ends_at, now);
        if (left > 0 && left <= TRIAL_REMINDER_DAYS) {
          await sendTrialEnding(deps, h);
          result.trialReminders++;
        }
      } else if (v.status === "canceled" && v.access === "ended") {
        const until = h.current_period_end ?? h.trial_ends_at ?? null;
        const ago = until ? (now.getTime() - Date.parse(until)) / 86_400_000 : Infinity;
        if (ago <= ENDED_LOOKBACK_DAYS) {
          const r = await notifyPlatform(mail, `Plan ended: ${h.name}`, `${h.name} (${h.slug}): the plan ended on ${formatDate(until)}.`, `plan_ended:${h.id}:${until}`);
          if (r === "sent") result.ended++;
        }
      } else if (v.status === "past_due" && v.access === "locked") {
        const r = await notifyPlatform(
          mail,
          `Locked: ${h.name}`,
          `${h.name} (${h.slug}) has not paid since ${formatDate(h.past_due_since)}. The admin is now locked to the Plan page.`,
          `locked:${h.id}:${h.past_due_since ?? ""}`
        );
        if (r === "sent") result.locked++;
      }
    } catch (err) {
      console.error("[billing-daily] failed for", h.id, (err as Error).message);
    }
  }
  return result;
}
