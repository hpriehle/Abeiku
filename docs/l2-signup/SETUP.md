# L2 sign-up and billing: setup

Do everything in **test mode** first. Nothing here has been created in your accounts yet.

## 1. Database (Supabase SQL editor)

Run `docs/l2-signup/billing.sql` once. It is safe to run again. It adds billing columns to
`hotels`, a small `billing_events` table, and marks Aracuya `billing_exempt = true`.

Before it runs, every hotel keeps working as now, and sign-up answers "not ready yet".

## 2. Paystack (cedis)

Same Paystack account as guest payments.

1. Dashboard, switch to **Test mode**.
2. **Plans** (under Products or Subscriptions, depending on the dashboard version): create two plans.
   | Name | Amount | Interval | Currency |
   |---|---|---|---|
   | Abeiku, up to 5 rooms | 300 | Monthly | GHS |
   | Abeiku, 6 rooms or more | 500 | Monthly | GHS |
   Copy each **plan code** (`PLN_...`).
3. **Settings, API Keys & Webhooks**: the test webhook URL must be
   `https://<your host>/api/paystack/webhook` (the same URL guest payments already use; billing shares it).
4. Paystack signs webhooks with the **secret key** of that mode. `PAYSTACK_WEBHOOK_SECRET` must be
   that secret key (`sk_test_...` in test mode), as it already is for guest payments.
5. Refunds of the GH₵1 card check come out of the Paystack balance. Keep a few cedis there.

## 3. Stripe (dollars)

Abeiku's own Stripe account (not a hotel's).

1. Dashboard, switch to **Test mode**.
2. **Product catalog**: create two products, each with one **recurring monthly** price in USD.
   | Product | Price |
   |---|---|
   | Abeiku, up to 5 rooms | $25 / month |
   | Abeiku, 6 rooms or more | $40 / month |
   Copy each **price ID** (`price_...`). Do not add a trial to the price: the code sets 30 days.
3. **Developers, Webhooks, Add endpoint**: `https://<your host>/api/stripe/webhook`, with these events:
   `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`,
   `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`.
   Copy the **signing secret** (`whsec_...`).
4. **Settings, Billing, Subscriptions and emails** (optional): turn on retries for failed payments and
   the email reminder before a trial ends.

## 4. Environment variables

| Variable | Value | New? |
|---|---|---|
| `SIGNUP_OPEN` | `true` to open sign-up. Anything else (or unset): `/signup` shows "opens soon" and `/api/signup` answers 404. | new |
| `BILLING_LIVE` | `true` only when you use live keys for billing. Without it, billing refuses `sk_live_` keys. | new |
| `PAYSTACK_PLAN_SMALL` | Paystack plan code, GH₵300 | new |
| `PAYSTACK_PLAN_LARGE` | Paystack plan code, GH₵500 | new |
| `STRIPE_SECRET_KEY` | `sk_test_...` of Abeiku's Stripe account | new |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` from step 3.3 | new |
| `STRIPE_PRICE_SMALL` | Stripe price ID, $25 | new |
| `STRIPE_PRICE_LARGE` | Stripe price ID, $40 | new |
| `NEXT_PUBLIC_APP_URL` | public base URL, for example `https://abeiku.com` (return links from the card pages) | existing |
| `PAYSTACK_SECRET_KEY`, `PAYSTACK_WEBHOOK_SECRET`, `JWT_SECRET` | as now | existing |

Note: production uses a **live** `PAYSTACK_SECRET_KEY` for guest payments. To test billing with
Paystack test keys, use a local run or a preview deploy with the test key, not production.

## 5. Going live (only when you say yes)

1. Repeat steps 2 and 3 in live mode (new plan codes, price IDs, webhook endpoint and secret).
2. Set the live values and `BILLING_LIVE=true`.
3. Set `SIGNUP_OPEN=true` when you want the landing page's "Start free trial" to open the real sign-up.
