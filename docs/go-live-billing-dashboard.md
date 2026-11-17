# Billing go-live: Stripe and Paystack dashboard settings

What Harrison (or a Chrome session signed in as him) must switch on in the provider dashboards so
hotel owners see **Abeiku** on their card statements, receipts and card pages, and so failed
payments end cleanly. The code cannot set these: the APIs have no parameter for them, or they are
account-wide.

Do every step in **test mode first**, check it with a test sign-up, then repeat in live mode when
billing goes live (`BILLING_LIVE=true`, see `docs/l2-signup/SETUP.md` §5).

Name on bills, receipts and terms: **Abeiku**. Legal line: **Abeiku, operated by Automaddie LLC**.
Stripe is the Automaddie account.

What the code already does (no dashboard step needed):
- Stripe Checkout: subscription description "Abeiku monthly plan", invoice footer
  "Abeiku, operated by Automaddie LLC", and that line under the pay button
  (`src/lib/billing/stripe-api.ts`, `checkoutForm`).
- Every billing email from Abeiku ends with the legal line, and so does the Plan page.
- "Update card" on the Plan page opens the Stripe Billing Portal or Paystack's manage page.
- Trial-ending, payment-failed, cancelled and payment-received emails come from Abeiku itself
  (`src/lib/billing/emails.ts`).

Links below are for test mode. For live mode, remove `/test` from Stripe links, and switch the
Paystack dashboard to Live with the toggle at the top.

---

## Stripe (Automaddie account, dollars)

### 1. Statement descriptor: ABEIKU
Checkout in subscription mode has no statement-descriptor parameter, so this is set in the dashboard.

- **Account default** (affects every Automaddie charge, so only if Automaddie sells nothing else):
  [Settings → Business → Public details](https://dashboard.stripe.com/settings/public):
  - Statement descriptor: `ABEIKU`
  - Shortened descriptor: `ABEIKU`
  - Public business name: `Abeiku`
  - Support email: `hello@abeiku.com`, support website `https://abeiku.com`
- **Or per product** (keeps Automaddie's default for other charges; preferred if Automaddie has
  other products): [Product catalogue](https://dashboard.stripe.com/test/products) → open each
  Abeiku product → Edit → **Statement descriptor** `ABEIKU`.

### 2. Product names say Abeiku
[Product catalogue](https://dashboard.stripe.com/test/products): the two products whose prices are
in `STRIPE_PRICE_SMALL` and `STRIPE_PRICE_LARGE` must be named:
- `Abeiku, up to 5 rooms` ($25 / month)
- `Abeiku, 6 rooms or more` ($40 / month)

These names appear on Checkout, invoices, receipts and the Billing Portal.

### 3. Branding
[Settings → Branding](https://dashboard.stripe.com/settings/branding): Abeiku icon and logo,
brand colour `#2D4A3E`. Used on Checkout, the Billing Portal, invoices and receipts.

### 4. Receipt emails on
[Settings → Customer emails](https://dashboard.stripe.com/settings/emails):
- **Successful payments**: on (Stripe emails a receipt for each charge, with the branding above).
- **Refunds**: on.

Note: Abeiku also sends its own short "payment received" email. If two receipts per charge is too
many, say so and the Abeiku one can be switched off (one line in `src/lib/billing/webhooks.ts`).

### 5. Billing Portal on, with card update and cancel
[Settings → Billing → Customer portal](https://dashboard.stripe.com/test/settings/billing/portal):
- **Payment methods**: allow customers to update payment methods: **on**.
- **Cancel subscriptions**: **on**, mode **At the end of the billing period**,
  proration **none** (no partial refunds).
- **Switch plans**: off (room count changes go through the Plan page).
- **Update customer information**: email and billing address on; the rest as you like.
- **Invoice history**: on.
- **Business information**: headline "Abeiku", privacy policy `https://abeiku.com/privacy`,
  terms of service `https://abeiku.com/terms`.
- Default redirect link: `https://abeiku.com/admin/plan`.
- **Save**. (Until the portal is saved once, `POST /v1/billing_portal/sessions` fails and the
  Update card button sends the owner back to the Plan page with an error.)

### 6. Failed payments: retry, then cancel
[Settings → Billing → Revenue recovery / Subscriptions and emails](https://dashboard.stripe.com/test/settings/billing/automatic):
- **Smart Retries**: on (for example 4 tries within 2 weeks).
- **If all retries for a payment fail**: **Cancel the subscription**.
- **Emails → Send emails when card payments fail**: off (Abeiku sends its own, with the lock date).
  Turn on if you want both.
- **Emails → Send a reminder email 7 days before a free trial ends**: off (Abeiku sends a 3-day
  reminder). Turn on if you want both.

Abeiku also locks the admin 14 days after the first failed payment, whatever Stripe does.

### 7. Webhook: one more event
[Developers → Webhooks](https://dashboard.stripe.com/test/webhooks) → the
`https://abeiku.com/api/stripe/webhook` endpoint → **Add events**:
`customer.subscription.trial_will_end`, and `invoice.payment_succeeded` if not there.
(Already needed: `checkout.session.completed`, `customer.subscription.created`,
`customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`,
`invoice.payment_failed`.)

---

## Paystack (cedis)

I could not open Paystack's dashboard docs from here (their docs site refused automated reads),
so the menu names below are from Paystack's dashboard layout as generally documented; check them
on screen.

### 1. Business name on statements and receipts: Abeiku
[Settings → Business](https://dashboard.paystack.com/#/settings/business) (or **Preferences**):
- **Trading / business name**: `Abeiku`. This is what Paystack shows on its checkout page, on
  receipts and (for Ghana cards) on the statement.
- Support email `hello@abeiku.com`, website `https://abeiku.com`.
- Logo: Abeiku logo.
If the legal entity shown must stay "Automaddie LLC", keep that as the registered name and set
only the trading name to Abeiku.

### 2. Receipt emails on
[Settings → Preferences](https://dashboard.paystack.com/#/settings/preferences):
- **Send email receipts to customers**: on.
- Check one test subscription charge actually sends a receipt (not verified for subscription
  charges yet).

### 3. Plan names say Abeiku
[Plans](https://dashboard.paystack.com/#/plans): the plans in `PAYSTACK_PLAN_SMALL` and
`PAYSTACK_PLAN_LARGE` named `Abeiku, up to 5 rooms` (GH₵300 / month) and
`Abeiku, 6 rooms or more` (GH₵500 / month).

### 4. Card update and cancel
Nothing to switch on: the Plan page's **Update card** button calls
`GET /subscription/:code/manage/link` and sends the owner to Paystack's hosted manage page, where
they can change the card or cancel. Cancel from the Plan page disables the subscription
(`POST /subscription/disable`): no more charges, access to the end of the paid month.

### 5. Failed payments
Paystack retries a failed subscription charge on its own schedule and may not disable the
subscription by itself. Abeiku does not depend on it: 14 days after the first failed charge the
admin is locked to the Plan page until a charge succeeds.

### 6. Webhook
[Settings → API Keys & Webhooks](https://dashboard.paystack.com/#/settings/developers): webhook URL
`https://abeiku.com/api/paystack/webhook` (unchanged; already used).

---

## Netlify (not a payment dashboard, but needed for the reminders)

- `CRON_SECRET` must be set (it already is for the arrivals digest). The new scheduled function
  `netlify/functions/billing-daily.mts` runs at 09:00 UTC each day.
- Optional: `PLATFORM_ALERT_EMAIL` for sign-up / failed payment / cancel / plan-ended notes.
  If unset they go to Harrison's own address.

## Check after switching on (test mode)

1. Sign up a test hotel with Stripe test card `4242 4242 4242 4242`: the Checkout page shows
   "Abeiku, up to 5 rooms" and the legal line; the welcome email arrives.
2. On `/admin/plan`, **Update card** opens the Stripe portal with "Abeiku" at the top; it lets you
   change the card and cancel.
3. Same with Paystack test card; **Update card** opens Paystack's manage page.
4. In Stripe test mode, use card `4000 0000 0000 0341` (attaches, then fails) and advance the test
   clock past the trial: the failed-payment email arrives with a lock date 14 days on.
