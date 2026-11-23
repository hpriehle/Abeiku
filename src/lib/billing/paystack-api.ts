// Real Paystack calls for billing (https://paystack.com/docs/api/). Uses the platform's
// PAYSTACK_SECRET_KEY; refuses a live key unless BILLING_LIVE=true. Not used by tests.

import { assertKeyAllowed, type PaystackBillingApi, type PaystackSubscription, type PaystackTransaction } from "./providers";

const BASE = "https://api.paystack.co";

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("Missing PAYSTACK_SECRET_KEY");
  assertKeyAllowed(key, "Paystack");
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { status?: boolean; message?: string; data?: T };
  if (!res.ok || json.status === false) {
    throw new Error(`Paystack ${path}: ${res.status} ${json.message ?? ""}`.trim());
  }
  return json.data as T;
}

type Raw = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : null);

function toSubscription(d: Raw): PaystackSubscription {
  const plan = d.plan as Raw | string | undefined;
  const auth = d.authorization as Raw | string | undefined;
  const cust = d.customer as Raw | string | number | undefined;
  return {
    subscription_code: String(d.subscription_code ?? ""),
    email_token: String(d.email_token ?? ""),
    status: String(d.status ?? ""),
    next_payment_date: str(d.next_payment_date),
    plan_code: typeof plan === "object" && plan ? str(plan.plan_code) : str(plan),
    authorization_code: typeof auth === "object" && auth ? str(auth.authorization_code) : str(auth),
    customer_code: typeof cust === "object" && cust ? str(cust.customer_code) : null,
  };
}

export const paystackBillingApi: PaystackBillingApi = {
  async initializeCardCheck({ email, amountPesewas, reference, callbackUrl, metadata }) {
    const d = await call<Raw>("POST", "/transaction/initialize", {
      email,
      amount: amountPesewas,
      currency: "GHS",
      reference,
      callback_url: callbackUrl,
      channels: ["card"], // only cards give a reusable authorization
      metadata,
    });
    return { authorizationUrl: String(d.authorization_url), reference: String(d.reference ?? reference) };
  },

  async verifyTransaction(reference) {
    const d = await call<Raw>("GET", `/transaction/verify/${encodeURIComponent(reference)}`);
    const c = (d.customer ?? {}) as Raw;
    const a = d.authorization as Raw | null | undefined;
    const tx: PaystackTransaction = {
      reference: String(d.reference ?? reference),
      status: String(d.status ?? ""),
      amount: Number(d.amount ?? 0),
      currency: String(d.currency ?? ""),
      customer: { customer_code: String(c.customer_code ?? ""), email: String(c.email ?? "") },
      authorization: a
        ? { authorization_code: String(a.authorization_code ?? ""), reusable: a.reusable === true, channel: String(a.channel ?? "") }
        : null,
      metadata: (typeof d.metadata === "object" && d.metadata ? d.metadata : null) as Record<string, unknown> | null,
    };
    return tx;
  },

  async createSubscription({ customer, plan, authorization, startDate }) {
    const d = await call<Raw>("POST", "/subscription", { customer, plan, authorization, start_date: startDate });
    return toSubscription(d);
  },

  async fetchSubscription(code) {
    return toSubscription(await call<Raw>("GET", `/subscription/${encodeURIComponent(code)}`));
  },

  async disableSubscription(code, emailToken) {
    await call("POST", "/subscription/disable", { code, token: emailToken });
  },

  async refund(reference) {
    await call("POST", "/refund", { transaction: reference });
  },

  async manageLink(code) {
    const d = await call<Raw>("GET", `/subscription/${encodeURIComponent(code)}/manage/link`);
    const link = str(d?.link);
    if (!link) throw new Error("Paystack manage link: no link in reply");
    return link;
  },
};
