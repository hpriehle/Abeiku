# L2: self-serve sign-up with a 30-day trial and a card on file

Branch `chat/abeiku-l2-signup` (from `chat/abeiku-l1-landing`, 5522531). Not deployed. No real
payments, no calls to Paystack or Stripe (all provider calls are mocked in tests and screenshots),
no database writes.

## What a hotel owner sees (when `SIGNUP_OPEN=true`)

1. `/signup` step 1: hotel name, email, password. Creates the hotel (`billing_status = pending_card`)
   and the admin login, and logs them in with a session that only opens the sign-up steps.
2. Step 2: town, number of rooms, contact email. Shows the price for their size.
3. Step 3 (optional, can skip): Airbnb, Booking.com, VRBO calendar links and a Google calendar ID.
4. Step 4: pay in cedis (Paystack, GH₵300 or GH₵500) or dollars (Stripe, $25 or $40), by room
   count. "Add card and start free trial" opens the provider's card page.
5. `/signup/done`: "Your free trial has started", first charge date, then on to the admin
   (new hotels with no rooms go to the existing `/admin/onboarding` wizard).

In the admin: a green line on every page "Free trial: N days left. Your card is charged on ...";
a red line if a payment failed; an amber line after a cancel. A new **Plan** page (only for hotels
on billing) shows status, trial days left, rooms, plan, price, provider, next charge, lets them
change room count and cancel. The platform page (Harrison) gets a **Hotel plans** table: every
hotel's state, trial days left, plan and next charge or end date.

Screenshots at 375 wide: `1-account`, `2-hotel`, `3-calendars`, `4-plan-cedis`,
`4-plan-dollars`, `5-done`, `5-done-error`, `error-hotel-step` (`*-375.png`). None scroll sideways,
none contain an em dash (`shots-results.json`).

## How billing works

**Paystack (cedis).** Paystack has no free-trial switch. Its docs give `start_date` on
`POST /subscription` for a delayed first charge, and say a reusable card authorization comes from a
first card charge, which can be refunded. So:
1. a GH₵1 card check on a card-only checkout page (`channels: ["card"]`, metadata marks it as ours);
2. on return, verify it (must be ours, `success`, reusable, channel card);
3. create the subscription with the plan and that authorization, `start_date` = now + 30 days;
4. refund the GH₵1 in full (a failed refund is logged and does not undo the sign-up).
The page tells the owner: "Paystack takes GH₵1 now and we give it straight back."

**Stripe (dollars).** Checkout in `mode=subscription`, `subscription_data.trial_period_days=30`,
`payment_method_collection=always`, `client_reference_id` = hotel id. Stripe charges at trial end.

**Webhooks** (signature checked first, then each delivery applied once via `billing_events`):
| What happened | Paystack event | Stripe event | Hotel becomes |
|---|---|---|---|
| Trial started | (set on return) `subscription.create` | `checkout.session.completed` | trialing |
| Charge succeeded | `charge.success` with our plan, `invoice.update` paid | `invoice.paid` (amount > 0) | active |
| Charge failed | `invoice.payment_failed`, `charge.failed` with our plan | `invoice.payment_failed`, subscription `past_due` | past_due (red banner, still open) |
| Cancelled | `subscription.disable`, `subscription.not_renew` | `customer.subscription.deleted` or cancel at period end | canceled (open until the paid time or trial ends) |

`/api/paystack/webhook` is shared with guest payments: only subscription/invoice events, charges for
our plan codes, and the GH₵1 card check go to billing. Guest booking payments and payouts go on to
the existing code unchanged (tested). The signature check is the same as before, now in constant time.

**Cancel.** In the trial: Stripe subscription deleted now, Paystack subscription disabled before its
start date, so nothing is charged; access stays to the trial's end. After the trial: no more charges,
access to the end of the paid month. **Room count** change: the tier changes from the next charge
(Stripe: price swap with no proration; Paystack: a new subscription on the same card from the old
one's next payment date, then the old one is disabled).

## Who gets in

- `/api/signup` was publicly callable and created a hotel with no billing. Now: 404 unless
  `SIGNUP_OPEN=true`; 503 until `billing.sql` has run; at most 5 sign-ups an hour per IP; every new
  hotel starts `pending_card`.
- `pending_card` (or cancelled and ended): the session carries `billing=blocked`. Middleware sends
  `/admin/*` to `/signup` and answers 402 on `/api/admin/*` (except login/logout). The admin layout
  also re-checks the database on each page load, so a cancel that ended is caught even with an old
  session. Login sets the claim from the database.
- Aracuya: `billing_exempt = true` (set by the SQL). Hotels with no billing status (all existing
  ones) or with the columns missing are never blocked. If the billing read fails, the admin stays
  open (logged).

## Files

- `src/lib/billing/`: `plans.ts` (tiers, prices, trial dates, plan ids from env), `access.ts`
  (gating rules), `flow.ts` (card setup, finish, cancel, room change), `webhooks.ts` (signatures,
  events), `providers.ts` (interfaces), `paystack-api.ts` / `stripe-api.ts` (real calls, plain
  fetch, refuse live keys unless `BILLING_LIVE=true`), `supabase-store.ts`, `signup-input.ts`,
  `flags.ts` (`SIGNUP_OPEN`), `session.ts`, `route-helpers.ts`.
- Routes: `/api/signup` (replaced), `/api/signup/{state,hotel,calendars,card,complete}`,
  `/api/admin/billing/{cancel,rooms}`, `/api/stripe/webhook` (new), `/api/paystack/webhook` (billing
  branch added), `/api/admin/auth` (billing claim).
- Pages: `/signup` (wizard behind the flag, else the L1 placeholder), `/signup/done`, `/admin/plan`,
  banner in `src/app/admin/layout.tsx`, `Plan` nav item, billing table on `/admin/platform`.
- `src/middleware.ts`: now also matches `/api/admin/*` (only to block `billing=blocked` sessions).
- `docs/l2-signup/billing.sql`, `SETUP.md`, `scripts/shots.mjs`.

## Evidence

- `npm test`: 31 files, 281 tests passed (204 before; 77 new: tiers and prices, trial dates, gating,
  Paystack and Stripe card setup with fakes, cancel, room change, webhook events, good and bad
  signatures for both, both webhook routes, middleware gate, sign-up route with flag off / SQL
  missing / rate limit, login claim).
- `npm run lint`: 0 errors, 24 warnings, none in files this change adds.
- `npm run build`: passes.
- `next start` with no database env, curl:
  - flag off: `/signup` shows "Sign-up opens soon"; `POST /api/signup` 404; `/` 200 and links to `/signup`.
  - blocked session cookie: `/admin/dashboard` 307 to `/signup`; `/api/admin/rooms` 402.
  - no cookie: `/admin/dashboard` 307 to `/admin/login`.
  - `/api/stripe/webhook` and `/api/paystack/webhook` with bad signatures: 400.
- Screenshots: `next start` with `SIGNUP_OPEN=true`, sign-up APIs mocked in the browser.

## What to test live (test mode, after SETUP.md)

1. Run `billing.sql`. Log in as Aracuya: admin works, no banner, no Plan item; `/admin/platform`
   shows Aracuya "Exempt".
2. Set test env vars and `SIGNUP_OPEN=true` on a local or preview run. Sign up a test hotel with
   4 rooms. Before adding a card, try `/admin/dashboard`: you land on `/signup`.
3. Cedis: add Paystack test card. Check: GH₵1 charged and refunded in Paystack; subscription with
   start date 30 days out on the GH₵300 plan; banner "30 days left"; Plan page; platform table.
4. Dollars: second test hotel with 8 rooms; Stripe test card 4242...: subscription trialing on the
   $40 price, trial end 30 days out.
5. Failed charge: Stripe test clock (advance past trial with card 4000 0000 0000 0341) or Paystack
   failing test card. Expect the red "payment did not go through" line.
6. Cancel in trial on both: Plan page, "Cancel my plan". Stripe subscription gone; Paystack
   subscription disabled; no charge; access until trial end.
7. Change rooms 4 to 8 on the Plan page: Stripe price swapped; Paystack new subscription, old one disabled.
8. Guest card payment on Aracuya still completes (shared Paystack webhook).

## Not done

- **Calendar links are stored only.** Calendar sync still reads only Aracuya's feeds from env (not
  touched, as asked). A new hotel's Airbnb/Booking.com/VRBO/Google links are saved in
  `hotels.calendar_links` but not synced. There is no screen to edit them after sign-up.
- **Changing card** (for a failed payment): no self-serve screen; the Plan page says to email
  hello@abeiku.com. Stripe's customer portal or a Paystack "update card" link would be the next step.
- **Restart after cancel**: not supported; the page says to email.
- The room count on the Plan page is its own number; it is not linked to the rooms set up on the
  Rooms page.
- `/admin/plan` and the banner were not screenshotted (they need a database); covered by tests.
- An old session (up to 7 days) of a hotel whose plan ended can still call `/api/admin/*` until it
  logs in again; pages are blocked at once by the layout check.
- Two tabs finishing the same Paystack card check at the same second could create two subscriptions
  (very unlikely; the second would show in Paystack and could be disabled there).

## For Harrison to decide

- Say yes before anything is created in live Paystack or Stripe, and when to set `SIGNUP_OPEN=true`.
- Small choices made here (easy to change): card check is GH₵1 (refunded); the trial starts when the
  card is added, not at account creation; a failed payment shows a red banner but does not lock the
  admin; after a cancel the hotel keeps access to the end of the trial or paid month, then sees
  "Your plan has ended, email us"; max 5 sign-ups per hour per IP; trial banner shows on every admin
  page during the trial.
