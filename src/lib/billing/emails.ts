// Billing emails to the hotel owner, and short notes to the platform (Harrison).
//
// Sent with the existing sendEmail (Resend, from notifications@abeiku.com), passed in as
// `send` so tests use a mock. Each email is sent at most once: its key is claimed in
// billing_events (provider "email") before sending, and released again if the send fails.
// Nothing here throws: a failed email is logged and never breaks a webhook or a page.

import { LEGAL_ENTITY, SITE_URL } from "@/lib/site";
import { opsAlertEmail } from "@/lib/ops/alerts";
import { formatPrice, type BillingCurrency, type Tier } from "./plans";
import type { BillingHotel, BillingStore } from "./store";

export type SendEmail = (params: { to: string; subject: string; html: string; text?: string }) => Promise<{
  success: boolean;
  error?: string;
}>;

/** The legal line on every billing email and on the Plan page. */
export const LEGAL_LINE = `Abeiku, operated by ${LEGAL_ENTITY}`;

export function formatDate(iso: string | null | undefined): string {
  if (!iso || Number.isNaN(Date.parse(iso))) return "soon";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Accra" });
}

/** An amount in the smallest unit (pesewas, cents) as owners read it. */
export function formatMinor(amount: number, currency: string): string {
  const v = (amount / 100).toFixed(amount % 100 === 0 ? 0 : 2);
  return currency.toUpperCase() === "GHS" ? `GH₵${v}` : currency.toUpperCase() === "USD" ? `$${v}` : `${v} ${currency.toUpperCase()}`;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export interface EmailBody {
  subject: string;
  /** Paragraphs of plain text. */
  lines: string[];
  /** Optional button: label and absolute URL. */
  action?: { label: string; url: string };
}

/** HTML and text versions, both ending with the legal line. */
export function render(body: EmailBody): { subject: string; html: string; text: string } {
  const paras = body.lines.map((l) => `<p style="margin:0 0 14px">${esc(l)}</p>`).join("");
  const button = body.action
    ? `<p style="margin:20px 0"><a href="${esc(body.action.url)}" style="display:inline-block;padding:12px 20px;background:#2D4A3E;color:#ffffff;border-radius:8px;text-decoration:none;font-weight:600">${esc(body.action.label)}</a></p>`
    : "";
  const footer = `<p style="margin:24px 0 0;font-size:12px;color:#6b7280">${esc(LEGAL_LINE)}</p>`;
  const text = [...body.lines, ...(body.action ? [`${body.action.label}: ${body.action.url}`] : []), "", LEGAL_LINE].join("\n\n");
  return { subject: body.subject, html: paras + button + footer, text };
}

const planUrl = () => `${SITE_URL}/admin/plan`;
const cardUrl = () => `${SITE_URL}/api/admin/billing/card`;

/** The texts. Pure, so tests can check wording. */
export const templates = {
  trialStarted(h: Pick<BillingHotel, "name">, firstCharge: string | null, price: string | null): EmailBody {
    return {
      subject: "Your Abeiku free trial has started",
      lines: [
        `Welcome to Abeiku. ${h.name} is set up and your free trial has started.`,
        price
          ? `Your card is first charged ${price} on ${formatDate(firstCharge)}. After that, ${price} every month.`
          : `Your card is first charged on ${formatDate(firstCharge)}.`,
        "You can cancel any time on the Plan page before then and you pay nothing.",
      ],
      action: { label: "See your plan", url: planUrl() },
    };
  },

  planRestarted(h: Pick<BillingHotel, "name">, price: string | null): EmailBody {
    return {
      subject: "Your Abeiku plan has started again",
      lines: [
        `Welcome back. The Abeiku plan for ${h.name} has started again.`,
        price ? `Your card is charged ${price} now and then every month.` : "Your card is charged now and then every month.",
      ],
      action: { label: "See your plan", url: planUrl() },
    };
  },

  trialEndingSoon(h: Pick<BillingHotel, "name">, chargeOn: string | null, price: string | null): EmailBody {
    return {
      subject: "Your Abeiku free trial ends in 3 days",
      lines: [
        `The free trial for ${h.name} ends on ${formatDate(chargeOn)}.`,
        price
          ? `On that day your card is charged ${price}, then ${price} every month.`
          : "On that day your card is charged for the first month.",
        "Nothing to do if you want to keep Abeiku. To stop, cancel on the Plan page before that date.",
      ],
      action: { label: "See your plan", url: planUrl() },
    };
  },

  paymentFailed(h: Pick<BillingHotel, "name">, lockAt: string | null): EmailBody {
    return {
      subject: "Your Abeiku payment failed",
      lines: [
        `We could not take the monthly payment for ${h.name}.`,
        "Please check that your card has money on it and has not expired, or add a new card.",
        lockAt
          ? `Update your card by ${formatDate(lockAt)} to keep access. After that date the admin is locked until the payment goes through.`
          : "Update your card soon to keep access.",
      ],
      action: { label: "Update card", url: cardUrl() },
    };
  },

  canceled(h: Pick<BillingHotel, "name">, endsAt: string | null): EmailBody {
    return {
      subject: "Your Abeiku plan is cancelled",
      lines: [
        `The Abeiku plan for ${h.name} is cancelled. You will not be charged again.`,
        endsAt ? `You can keep using Abeiku until ${formatDate(endsAt)}.` : "Your access ends at the end of the time you paid for.",
        "Changed your mind? You can start again from the sign-up page after it ends.",
      ],
      action: { label: "See your plan", url: planUrl() },
    };
  },

  paymentReceived(h: Pick<BillingHotel, "name">, amount: string | null, nextCharge: string | null): EmailBody {
    return {
      subject: "Abeiku payment received",
      lines: [
        amount ? `Thank you. We received ${amount} for the Abeiku plan for ${h.name}.` : `Thank you. We received your payment for ${h.name}.`,
        ...(nextCharge ? [`Your next charge is on ${formatDate(nextCharge)}.`] : []),
      ],
      action: { label: "See your plan", url: planUrl() },
    };
  },
};

export function planPrice(h: Pick<BillingHotel, "billing_tier" | "billing_currency">): string | null {
  const tier = h.billing_tier === "small" || h.billing_tier === "large" ? (h.billing_tier as Tier) : null;
  const cur = h.billing_currency === "GHS" || h.billing_currency === "USD" ? (h.billing_currency as BillingCurrency) : null;
  return tier && cur ? formatPrice(tier, cur) : null;
}

export type SendResult = "sent" | "already" | "failed" | "no_address" | "off";

export interface Mail {
  store: BillingStore;
  /** Absent: emails are off (tests that don't care, scripts). */
  send?: SendEmail;
  /** Platform address; default opsAlertEmail() (same address as the ops alerts). */
  platformEmail?: string;
}

/** Sends `body` to `to` once per `key`. */
export async function sendOnce(mail: Mail, key: string, to: string | null, body: EmailBody): Promise<SendResult> {
  if (!mail.send) return "off";
  if (!to) return "no_address";
  try {
    if (!(await mail.store.claimEmail(key))) return "already";
  } catch (err) {
    console.error("[billing-email] marker failed, not sending", key, (err as Error).message);
    return "failed";
  }
  const r = await mail.send({ to, ...render(body) }).catch((err: unknown) => ({ success: false, error: String(err) }));
  if (r.success) return "sent";
  console.error("[billing-email] send failed", key, r.error);
  await mail.store.releaseEmail(key).catch(() => {});
  return "failed";
}

/** Email to the hotel's login address, once per key. */
export async function emailOwner(mail: Mail, hotel: BillingHotel, key: string, body: EmailBody): Promise<SendResult> {
  let to: string | null = null;
  try {
    to = await mail.store.ownerEmail(hotel.id);
  } catch (err) {
    console.error("[billing-email] owner lookup failed", hotel.id, (err as Error).message);
    to = hotel.contact_email;
  }
  return sendOnce(mail, key, to, body);
}

/**
 * A short note to the platform (OPS_ALERT_EMAIL). With `key` it is sent once per key;
 * without, every call sends.
 */
export async function notifyPlatform(mail: Mail, subject: string, text: string, key?: string): Promise<SendResult> {
  const to = mail.platformEmail ?? opsAlertEmail();
  const body: EmailBody = { subject: `[Abeiku] ${subject}`, lines: text.split("\n").filter(Boolean) };
  if (key) return sendOnce(mail, `platform:${key}`, to, body);
  if (!mail.send) return "off";
  const r = await mail.send({ to, ...render(body) }).catch((err: unknown) => ({ success: false, error: String(err) }));
  if (!r.success) console.error("[billing-email] platform note failed", subject, r.error);
  return r.success ? "sent" : "failed";
}
