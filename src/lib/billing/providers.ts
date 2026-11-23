// The provider calls billing needs, behind small interfaces so tests use fakes.
// Real implementations: ./paystack-api.ts and ./stripe-api.ts.

export interface PaystackTransaction {
  reference: string;
  status: string; // "success" when paid
  amount: number; // pesewas
  currency: string;
  customer: { customer_code: string; email: string };
  authorization: { authorization_code: string; reusable: boolean; channel: string } | null;
  metadata: Record<string, unknown> | null;
}

export interface PaystackSubscription {
  subscription_code: string;
  email_token: string;
  status: string;
  next_payment_date: string | null;
  plan_code: string | null;
  authorization_code: string | null;
  customer_code: string | null;
}

export interface PaystackBillingApi {
  /** Hosted card page for the small card-check charge. */
  initializeCardCheck(input: {
    email: string;
    amountPesewas: number;
    reference: string;
    callbackUrl: string;
    metadata: Record<string, unknown>;
  }): Promise<{ authorizationUrl: string; reference: string }>;
  verifyTransaction(reference: string): Promise<PaystackTransaction>;
  createSubscription(input: {
    customer: string;
    plan: string;
    authorization: string;
    startDate: string;
  }): Promise<PaystackSubscription>;
  fetchSubscription(code: string): Promise<PaystackSubscription>;
  disableSubscription(code: string, emailToken: string): Promise<void>;
  /** Full refund of a transaction (the card check). */
  refund(reference: string): Promise<void>;
  /** Link to Paystack's hosted page where the owner updates the card (GET /subscription/:code/manage/link). */
  manageLink(subscriptionCode: string): Promise<string>;
}

export interface StripeSubscription {
  id: string;
  status: string; // trialing | active | past_due | unpaid | canceled | incomplete | incomplete_expired | paused
  customer: string;
  trial_end: number | null; // unix seconds
  current_period_end: number | null; // unix seconds
  cancel_at_period_end: boolean;
  cancel_at: number | null;
  item: { id: string; price: string } | null;
  metadata: Record<string, string>;
}

export interface StripeCheckoutSession {
  id: string;
  status: string | null; // open | complete | expired
  mode: string;
  client_reference_id: string | null;
  customer: string | null;
  subscription: string | null;
  metadata: Record<string, string>;
}

export interface StripeBillingApi {
  createCheckoutSession(input: {
    price: string;
    hotelId: string;
    email: string;
    /** 0: no trial (restart after a cancel): Stripe charges at once. */
    trialDays: number;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ id: string; url: string }>;
  retrieveCheckoutSession(id: string): Promise<StripeCheckoutSession>;
  retrieveSubscription(id: string): Promise<StripeSubscription>;
  /** atPeriodEnd false: cancel now (used in the trial, so nothing is charged). */
  cancelSubscription(id: string, atPeriodEnd: boolean): Promise<StripeSubscription>;
  /** Swap the price from the next invoice on, no proration. */
  changePrice(subscriptionId: string, itemId: string, price: string): Promise<StripeSubscription>;
  /** Move the trial end (unix seconds), no proration. */
  extendTrial(subscriptionId: string, trialEnd: number): Promise<StripeSubscription>;
  /** Billing Portal session (card update, cancel) for a customer; returns its URL. */
  createPortalSession(customerId: string, returnUrl: string): Promise<string>;
}

/** Refuse live keys unless BILLING_LIVE=true, so a test build can never charge a real card. */
export function assertKeyAllowed(key: string, provider: string, env: NodeJS.ProcessEnv = process.env): void {
  if (/^(sk|rk)_live_/.test(key) && env.BILLING_LIVE !== "true") {
    throw new Error(`${provider} live key refused: set BILLING_LIVE=true to use live billing`);
  }
}
