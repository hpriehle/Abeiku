# Gaps audit: what a paying hotel expects that Abeiku is missing

Audited 2026-11-16 against `origin/main` e6b0dd5 (what runs on abeiku.com). The audit was read-only:
code, `docs/*/REPORT.md`, GET requests to abeiku.com, and `dig` for DNS. No logins, sign-ups or writes.
Sizes: **S** = under half a day, **M** = 1 to 2 days, **L** = more than 2 days.
Why it matters: **money** = lost money, **locked out** = the customer can't get in, **support** = more emails to Harrison, **legal** = a legal or compliance risk.

## The ranked list

### Must have before sign-up opens

| # | Gap | Why | Size |
|---|---|---|---|
| 1 | Forgot password | locked out | **in progress** (task abeiku-forgot-pw, branch `chat/abeiku-forgot-pw` 1945eae) |
| 2 | Billing is not live: live Paystack plans, live Stripe prices and webhook, `BILLING_LIVE` | money | S (setup only) |
| 3 | No Terms, Privacy or Refund/Cancellation pages | legal, money | S to M |
| 4 | A failed payment never blocks access | money | S |
| 5 | Nobody gets an email at the moments that matter (welcome, trial ending, payment failed, cancelled) | money, support | M |
| 6 | Hotels can't change their card | money, support | S to M |
| 7 | The login email is never checked, and there's no way to change the email or password | locked out, support | M |
| 8 | Customers can see features that don't work for them (WhatsApp, Simulator, "Dev: Run Onboarding") | support | S |
| 9 | Partner tracking is advertised but only works for Aracuya | support, refunds | S (copy) or L (build) |
| 10 | Stripe is the Automaddie account: card statements and receipts may show "Automaddie" | money (chargebacks), support | S (check) |
| 11 | The room count you pay for is not tied to the rooms you set up | money | S |
| 12 | Default Next.js favicon and 404 page | trust | S |

### Soon after (first month of real hotels)

| # | Gap | Why | Size |
|---|---|---|---|
| 13 | No alert when crons, syncs or webhooks fail | support, money | S to M |
| 14 | Harrison can't act on a hotel (extend a trial, exempt, suspend, see what they see) | support | M |
| 15 | Harrison isn't told when a hotel signs up, cancels or fails a payment | money | S |
| 16 | No restart after cancel | money | S to M |
| 17 | Sessions survive a password reset (7-day JWT, no way to revoke) | security | S |
| 18 | Backups: unknown | data loss | S (check) |
| 19 | Abandoned sign-ups (`pending_card`) pile up and get no reminder | money | S |
| 20 | No account deletion or data export | legal, support | M |
| 21 | Onboarding has two different Google Calendar connections | support | S |

### Nice to have

| # | Gap | Size |
|---|---|---|
| 22 | Staff logins and roles (several users per hotel) | L |
| 23 | Invoices and receipts inside Abeiku | M |
| 24 | Plan revenue (MRR) on the platform page; it shows only guest-payment totals labelled "GHS" | S |
| 25 | Empty calendar: say why, and link to Calendars | S |
| 26 | Dates without a `timeZone` (33 calls in `src/app/admin`) | S |
| 27 | No `og:image`, `robots.txt` or `sitemap.xml` | S |
| 28 | DMARC is `p=none` | S |
| 29 | Free trials can be repeated with a new email and card | S |

---

## Details

### 1. Forgot password: in progress
- **Missing on main:** `src/app/admin/login/page.tsx` has no reset link. Harrison was locked out on 2026-11-16 and needed a script to get back in (UPLINK.md log 13:15).
- **In progress:** branch `chat/abeiku-forgot-pw` (email link, 1-hour single-use token, "password changed" email). Not specced here. See #17 for what happens to old sessions.

### 2. Billing is not live
- **Where:** `src/lib/billing/providers.ts:88` refuses `sk_live_` keys unless `BILLING_LIVE=true`. `docs/l2-signup/SETUP.md` §5 "Going live" is not done. Only test plans and prices exist: Paystack `PLN_5gfxaka8smfjf62` / `PLN_eluhgfrtsyydulo` and Stripe `price_1UcRp…` (`livemode false`).
- **Why:** with `SIGNUP_OPEN=true` and test keys, hotels "pay" with test cards and no money comes in. With live keys and no `BILLING_LIVE`, sign-up fails at the card step.
- **Fix:** follow SETUP.md §5. Create the live Paystack plans (GH₵300/500), the live Stripe prices ($25/$40) and the live Stripe webhook to `https://abeiku.com/api/stripe/webhook`, and confirm the Paystack webhook URL in live mode. Set the env vars and `BILLING_LIVE=true` on production only, then run one real sign-up with Harrison's own card and cancel it. Needs Harrison's yes (money).

### 3. No Terms, Privacy or Refund/Cancellation pages
- **Live check:** `https://abeiku.com/terms` and `/privacy` return 404, and there is nothing under `src/app` for either. The landing page links only to `/`, `/signup`, `/admin/login`, `/partner/login` and `mailto:hello@abeiku.com`. Sign-up step 1 (`src/app/signup/SignupWizard.tsx`, `src/lib/billing/signup-input.ts`) has no "I agree to the Terms" checkbox.
- **Why:**
  - Card processors expect a public refund and cancellation policy and a contact on the merchant's site. Without one, live activation can be held up, and disputes are lost because there is no policy to point to. I'm stating this from general Paystack and Stripe practice; I didn't re-read their current rules.
  - Abeiku stores hotel guests' personal data (names, phones, emails, stays). In Ghana that is covered by the Data Protection Act, 2012 (Act 843), which has a registration duty for data controllers. Whether Abeiku must register as a controller or acts only as a processor is a question for a lawyer; I haven't checked it.
- **Fix:** add three static pages (`/terms`, `/privacy`, `/refunds`, or one `/legal` page) with a footer link on the landing page, the sign-up page and the admin. Add "By starting a trial you agree to the Terms" with a link on sign-up step 1, and store `terms_accepted_at` on `admin_users`. Harrison needs to approve the text: the 30-day trial, monthly charges, cancel any time with access to the end of the paid month, no refunds for part-months (or whatever he decides), where data is stored (Supabase, region unknown), and deletion on request.

### 4. A failed payment never blocks access
- **Where:** `src/lib/billing/access.ts`, `case "past_due": return { ...base, access: "full", … }`. `src/lib/billing/webhooks.ts` sets `past_due` on `charge.failed` / `invoice.payment_failed` and only leaves it on a later success or a cancel.
- **Why:**
  - **Paystack:** I'm not sure Paystack ever disables a subscription by itself after failed charges. If it doesn't, the hotel stays `past_due` with full access forever.
  - **Stripe:** what happens after retries run out depends on the Automaddie dashboard setting (cancel, mark unpaid, or leave past due). I can't see that from here. If it is "leave past due", it's the same problem.
- **Fix:** a grace period. Store `past_due_since` when the status first becomes `past_due`. After N days (suggest 14), `billingView` returns `access: "ended"`-like blocking with a "Update your card" screen (needs #6). In Stripe, set "if all retries fail → cancel subscription". Add tests to `billing.test.ts`.

### 5. No billing or lifecycle emails
- **Where:** the only senders are booking alerts (`src/lib/alerts/index.ts`) and guest notifications (`src/lib/notifications/index.ts`). Nothing under `src/app/api/signup`, `src/lib/billing`, `src/app/api/stripe` or `src/app/api/paystack` sends mail. Stripe's `customer.subscription.trial_will_end` isn't handled (`webhooks.ts` default branch).
- **Why:** owners pay with a card they set up 30 days earlier. A surprise charge with no reminder leads to disputes. A failed payment with no email means the banner is the only signal, and an owner who doesn't log in that week never sees it.
- **Fix:** one `src/lib/billing/emails.ts` using the existing `sendEmail` (Resend, from `notifications@abeiku.com`, already verified). Send to the login email:
  - welcome / trial started, with the first charge date and amount;
  - trial ends in 3 days, from a daily cron or `trial_will_end` for Stripe; Paystack has no equivalent event, so use the existing scheduled-function pattern (`netlify/functions/arrivals-digest.mts`);
  - payment failed, with how to fix it;
  - cancelled, with the end date;
  - payment received, unless the providers' own receipts are on (see #23).

  Send each once, keyed on `billing_events`. Stripe can also send its own trial-ending and failed-payment emails from Dashboard → Billing settings. I haven't checked whether the Automaddie account has them on.

### 6. Hotels can't change their card
- **Where:** `src/app/admin/plan/page.tsx:67-68` says "To use a new card, email hello@abeiku.com". `docs/l2-signup/REPORT.md` "Not done" says the same.
- **Why:** an expired card is the most common reason a subscription stops. Every case becomes a support email, and Harrison can't take a card by email anyway.
- **Fix:**
  - **Stripe:** a "Update card" button that creates a Billing Portal session (`POST /v1/billing_portal/sessions` with `billing_customer_id`) and redirects. Turn on the portal in the Stripe dashboard. Size S.
  - **Paystack:** call `GET /subscription/:code/manage/link` and redirect to the link Paystack hosts, where the owner can update the card. Size S. I'm going from memory of Paystack's API; check it's still available.
  - Both: one route `/api/admin/billing/card`.

### 7. The login email is never checked; no way to change email or password
- **Where:** `src/app/api/signup/route.ts` creates the login and the session at once and never sends a verification email. `admin_users` (`supabase-schema.sql:49`) has no `email_verified_at`. There is no account or profile screen: `src/app/admin/settings/page.tsx` lists only Connected Services, and nothing under `src/app/api/admin` changes `admin_users.email` or `password_hash` while logged in. The alert email can be changed (`/api/admin/hotel/alert-email`).
- **Why:** a typo in the email at sign-up means:
  - forgot password (#1) emails a stranger or nobody, so the owner is locked out;
  - trial and payment emails (#5) never arrive;
  - alerts default to that address (`chat/abeiku-l2-alert-email`), so booking alerts are lost too.

  Someone can also sign up with another person's email and block it, because emails are `UNIQUE` and sign-up returns 409 "Log in instead".
- **Fix:**
  - **Account page** `/admin/settings/account`: change password (asks for the current one) and change email (sends a confirm link to the new address, and only switches after the click). Size M.
  - **Verification at sign-up:** send a confirm link and show "Check your email" in the admin banner until it's clicked. Don't block the trial on it; block only billing emails to an unconfirmed address and nag. Reuse the token table and mailer from forgot-password. Size S once #1 has landed.

### 8. Customers can see features that don't work for them
- **Where:**
  - `src/app/admin/AdminNav.tsx:31,39`: "Communication" (WhatsApp inbox) and "Simulator" are in every hotel's menu.
  - `src/app/admin/settings/page.tsx:180`: a "Dev: Run Onboarding" button.
  - `src/app/admin/onboarding/page.tsx` step 3: "WhatsApp Cloud API: Enable WhatsApp booking assistant" with an Access Token field.
  - Settings links to WhatsApp, MoMo and Paystack payout setup.

  WhatsApp isn't live for any hotel (UPLINK.md W1/W2; the Meta account is restricted), and MoMo is sandbox (`docs/audit-2026-11-14`).
- **Why:** a new owner tries them, they fail, and the owner emails support or concludes the product is broken. The landing page itself says WhatsApp is "not ready yet".
- **Fix:** a per-hotel or global feature flag (e.g. `FEATURES_FOR_NEW_HOTELS`) that hides Communication, Simulator, WhatsApp/MoMo/Paystack-payout settings and onboarding step 3's WhatsApp block for non-exempt hotels. Remove the "Dev:" button, or show it only to `role === "platform_admin"`.

### 9. Partner tracking is advertised but only works for Aracuya
- **Where:** the landing page says "Track the bookings that tour operators, agencies and other partners send you" (live check). In code, bookings reach a partner only when the hotel's own website posts them to `/api/public/referral/[hotelSlug]/booking`, which aracuya.com does because it was built to. The partner link base comes from the env var `PARTNER_SITE_URLS` (`src/lib/partner/views.ts:29-42`), which only Harrison can set, and there is no screen for it.
- **Why:** a new hotel adds partners and never sees a booking. That means refund requests or support.
- **Fix:** either reword the landing line now ("coming soon", or "for hotels whose website we connect"), size S, or build it: per-hotel site URL field, ref links pointing at the Abeiku widget, and manual "attribute this booking to partner X" in the booking drawer. Size L. Harrison to choose.

### 10. Stripe account is Automaddie
- **Where:** UPLINK.md log 2026-11-15 23:35: he picked the Automaddie Stripe account.
- **Why:** card statements and Stripe receipts show the account's public business name and statement descriptor. If that's "Automaddie", hotel owners won't recognise the charge and may dispute it. Disputes cost money and count against the account.
- **Fix:** in Stripe, set the statement descriptor (e.g. "ABEIKU") and the receipt branding, or create a separate Abeiku Stripe account before going live. Alternatively pass `subscription_data.description` / a statement-descriptor suffix in `src/lib/billing/stripe-api.ts`, which sets none today. I haven't checked what Automaddie's current descriptor is.

### 11. The room count you pay for isn't tied to the rooms you set up
- **Where:** `/admin/plan` keeps its own number (`src/app/api/admin/billing/rooms/route.ts`). `docs/l2-signup/REPORT.md` "Not done": "not linked to the rooms set up on the Rooms page". Room create (`src/app/api/admin/rooms/route.ts`) never checks the tier.
- **Why:** a hotel can sign up as "up to 5 rooms" (GH₵300) and set up 12 rooms. The difference is GH₵200 a month.
- **Fix:** count active rooms when rooms are saved (multi-unit rooms by their unit count). If that pushes the hotel over 5 on the small tier, show "You now have N rooms: your plan moves to GH₵500 from <next charge>" and call the existing room-change flow (`src/lib/billing/flow.ts`). Or at least list mismatches on the platform page so Harrison can follow up.

### 12. Default favicon and 404 page
- **Where:** `src/app/favicon.ico` is the Create Next App original (`git log`: "Initial commit from Create Next App"; md5 c30c7d42…). `public/` still holds `next.svg`, `vercel.svg`, `file.svg`, `globe.svg` and `window.svg`. There is no `src/app/not-found.tsx`, `error.tsx` or `global-error.tsx`. Live: `https://abeiku.com/nonexistent-xyz` shows Next's plain "404 | This page could not be found". A server error shows Next's default error page.
- **Why:** the browser tab shows the Vercel triangle. A crash or broken link shows a bare page with no way back and no contact.
- **Fix:** an Abeiku icon (`src/app/icon.png` + `apple-icon.png`), and delete the unused SVGs. `not-found.tsx` and `error.tsx` should say "Something went wrong", with links to Home or Admin and to hello@abeiku.com.

### 13. No alert when crons, syncs or webhooks fail
- **Where:** `netlify/functions/booking-sync.mts`, `arrivals-digest.mts` and `lifecycle.mts` only `console.log` / `console.error`. Webhook routes log and return. Nothing in `package.json` or `src` for Sentry, uptime checks or heartbeats, and there is no `/api/health` (live 404). Per-feed sync errors are shown to the hotel on `/admin/settings/calendars` (`CalendarFeeds.tsx:41-47`), and that part works.
- **Why:**
  - If the 15-minute sync stops (an expired `CRON_SECRET`, or the Netlify function timeout, which `docs/l2-feeds/REPORT.md:81` says isn't known from the repo), every hotel's calendar goes stale silently and they double-book.
  - If a billing webhook keeps failing, hotel status drifts from what they pay. Stripe does email the account owner about failing webhook endpoints, but that goes to the Automaddie account.
- **Fix:**
  - A free uptime monitor or heartbeat service, pinged by `booking-sync` on success. It emails Harrison when no ping arrives for 1 hour.
  - `/api/health` that checks the DB.
  - In the webhook routes, email Harrison on handler errors, at most once an hour.
  - Optionally Sentry (free tier) for server errors.

### 14. Harrison can't act on a hotel
- **Where:** `src/app/admin/platform/page.tsx` + `BillingTable.tsx` are read-only (stats, earnings, billing table). The `platform_admin` role is a normal admin of one hotel (`admin_users.hotel_id NOT NULL`). There is no "view as this hotel", no extend trial, no set exempt, no suspend, no delete.
- **Why:** every support case ("I can't see my bookings", "can I have 2 more weeks", "delete my account") means SQL in the Supabase console.
- **Fix:** platform page row actions: extend trial by N days (also on Stripe via `trial_end` and on Paystack by moving the subscription start; that last part is fiddly), toggle exempt, suspend, and "Open as this hotel" (a short-lived admin session with an `actingAs` claim and a visible banner).

### 15. Harrison isn't told about sign-ups and billing events
- **Where:** no email to Harrison anywhere in `src/app/api/signup/*` or `src/lib/billing/webhooks.ts`.
- **Why:** he won't know a new hotel signed up (to welcome them), or that a paying hotel failed a payment or cancelled (to save the account).
- **Fix:** one `notifyPlatform(subject, text)` to `PLATFORM_ALERT_EMAIL` (hello@abeiku.com forwards to him) on: card added / trial started, payment failed, cancelled, plan ended. Size S.

### 16. No restart after cancel
- **Where:** `src/app/signup/SignupWizard.tsx:152-156` shows "Your plan has ended… To start again, email us."
- **Why:** a returning customer has to wait for a manual reply.
- **Fix:** from the "ended" step, offer "Start again". Set the hotel back to `pending_card` with no trial (`trial_period_days` 0 / Paystack `start_date` now) and run the existing card step.

### 17. Sessions survive a password reset
- **Where:** `src/lib/auth/session.ts`: stateless HS256 JWT, 7-day TTL, no session table and no version claim. The forgot-password branch doesn't touch sessions (no session or token-version change in `password-reset.ts`). Separately, `secretKey()` falls back to `"dev-secret-change-me"` when `JWT_SECRET` is missing. `JWT_SECRET` is in `.env.local`, but I didn't look at Netlify's env, so I can't confirm it is set in production.
- **Why:** someone who learned an owner's password keeps access for up to 7 days after the owner resets it.
- **Fix:** add `admin_users.password_changed_at`, put `iat` in the session check (layout and `getSession`), and reject tokens issued before it. Make `secretKey()` throw in production when `JWT_SECRET` is unset. Confirm on Netlify that `JWT_SECRET` is set.

### 18. Backups: unknown
- **Where:** the DB is Supabase. Nothing in the repo shows the plan or a backup setup, and I couldn't check the Supabase plan read-only.
- **Why:** the Supabase Free plan has no downloadable daily backups (as I understand it). One bad migration or a `DELETE` without `WHERE` (there are reset scripts in `scripts/`) would lose every hotel's bookings and settings.
- **Fix:** Harrison checks the plan in the Supabase dashboard. Either move to Pro (daily backups, PITR as an add-on) or add a nightly `pg_dump` to storage he owns. Then do one restore test.

### 19. Abandoned sign-ups pile up
- **Where:** hotels stuck in `pending_card` (step 1 done, no card) are never reminded or removed. `src/lib/billing/flow.ts:232` can finish a card check later, but only when the owner comes back.
- **Why:** these are warm leads lost. They also hold their email (UNIQUE) and slug.
- **Fix:** a daily job that emails a reminder after 1 day ("Finish setting up Abeiku") and deletes the hotel after 30 days. Delete is a cascade on `hotels`.

### 20. No account deletion or data export
- **Where:** nothing in `src/app/admin` or `src/app/api/admin` deletes a hotel or exports data. The one "export" in the code is help text about OTA iCal (`CalendarFeeds.tsx:152`). Cancel exists (`/api/admin/billing/cancel`), but data stays forever.
- **Why:** owners expect to take their bookings with them and to have guest data deleted when they leave. The privacy policy (#3) has to promise something we can actually do.
- **Fix:**
  - "Download my bookings (CSV)" on Bookings. Size S.
  - "Delete my hotel and all its data" on the Plan page after cancel, typed confirmation, emailing Harrison. Or, for now, the privacy policy says "email us and we delete within 30 days" and Harrison does it by SQL (cascade). Size S to M.

### 21. Two different Google Calendar connections
- **Where:** onboarding step 3 (`src/app/admin/onboarding/page.tsx:534+`) offers Google Calendar OAuth (`/api/auth/google`, needs `GOOGLE_OAUTH_CLIENT_*`). Sign-up step 3 and `/admin/settings/calendars` instead ask the owner to share the calendar with the service account (`GOOGLE_SERVICE_ACCOUNT_EMAIL`), and that is what the sync reads (`docs/l2-feeds/REPORT.md:30-31`). I didn't check whether the OAuth app is verified by Google. If it isn't, outside users get "unverified app".
- **Why:** owners connect the wrong one and see no bookings.
- **Fix:** remove the OAuth block from onboarding step 3 and link to `/admin/settings/calendars` instead.

### 22. Staff logins and roles
- **Where:** `admin_users` allows several rows per hotel and has `role`, but there is no invite screen. The only roles used are `admin` and `platform_admin`. `email` is globally UNIQUE, so one person can't belong to two hotels. The plan lists this as "Not in this plan: staff logins".
- **Why:** owners share one password with reception. Then nobody can be removed, and #17 makes it worse.
- **Fix:** Settings → Team: invite by email (reuse the reset-token flow), roles owner/staff (staff can't see Plan or Partners payouts), and remove user. Size L.

### 23. Invoices and receipts
- **Where:** `/admin/plan` shows status, next charge and provider. It has no list of past charges and no receipts.
- **Why:** businesses need receipts for their accounts. Stripe sends emailed receipts only if "Successful payments" emails are on in its dashboard. Paystack emails customers a receipt per charge by default, as far as I know; I didn't verify that for subscription charges.
- **Fix:** first make sure both providers email receipts with Abeiku branding (dashboard settings, S). Later, list charges on the Plan page from `billing_events` or the provider API (M).

### 24. Plan revenue on the platform page
- **Where:** `src/app/admin/platform/page.tsx:49-55,103` shows only guest-payment totals, hardcoded `GHS`.
- **Fix:** a count of trialing / active / past_due / cancelled hotels and monthly revenue by currency, from `listHotelBilling()`.

### 25. Empty calendar
- **Where:** `src/app/admin/calendar/CalendarBoard.tsx:185-188` says "No bookings in these two weeks." (this exists).
- **Missing:** it doesn't say whether the hotel has no calendars connected, or when the next booking is.
- **Fix:** if the hotel has no feeds, show "Connect Airbnb, Booking.com or Google Calendar" with a link to `/admin/settings/calendars`. Otherwise show "Next booking: <date>" with a jump to it.

### 26. Time zone and currency display
- **Time zone:** 33 `toLocale*String` calls in `src/app/admin` pass no `timeZone`. Ghana is UTC and Netlify runs in UTC, so dates are right for hotels in Ghana. Harrison (US Eastern) may see dates near midnight shifted by a day in browser-rendered views. Fix: pass `timeZone: "Africa/Accra"` in a shared formatter. Size S.
- **Currency:** this exists. Rooms, bookings and calendar use `hotel.currency` (default GHS), and plans show GH₵ or $ by provider (`src/lib/billing/plans.ts`).

### 27. SEO and sharing basics
- **Live check:** `/robots.txt` and `/sitemap.xml` return 404. There is no `og:image`, though title, description, `og:title`/`og:description` and `twitter:card` exist. A shared link on WhatsApp shows no picture.
- **Fix:** `src/app/robots.ts`, `src/app/sitemap.ts` and `src/app/opengraph-image.png`.

### 28. Email deliverability: works; one tweak
- `dig` results:
  - Resend DKIM `resend._domainkey.abeiku.com` is present.
  - The return path `send.abeiku.com` has its MX and SPF (`v=spf1 ip4:52.3.252.119 … ~all`).
  - The root SPF is `v=spf1 +a +mx include:abeiku.com.spf.auto.dnssmarthost.net ~all`, for SiteGround mail.
  - DMARC is `v=DMARC1; p=none; aspf=r; adkim=r;`.
  - The MX is SiteGround antispam.

  A test mail from `notifications@abeiku.com` arrived on 2026-11-16 (UPLINK.md log 11:50).
- **Gap:** DMARC `p=none` with no `rua` reports, so nobody would see spoofing or failures. Fix: add `rua=mailto:hello@abeiku.com`, then move to `p=quarantine` after a few weeks of clean reports.

### 29. Repeat free trials
- **Where:** the sign-up limit is per IP (5 an hour, `src/app/api/signup/route.ts`). Nothing ties a trial to a card fingerprint or hotel name.
- **Fix later:** store the card fingerprint (Stripe `payment_method.card.fingerprint`, Paystack `authorization.signature`) and refuse a second trial on the same card.

---

## Checked and fine (exists)

| Area | Where |
|---|---|
| Sign-up behind `SIGNUP_OPEN`, 5 an hour per IP, every hotel starts `pending_card` | `src/app/api/signup/route.ts`, `src/lib/billing/flags.ts` |
| Admin blocked until a card is on file; ended plans blocked | `src/middleware.ts:32`, `src/lib/billing/access.ts`, `src/app/admin/layout.tsx` |
| Login rate limit (10 per 15 min per IP and account), constant-time miss | `src/app/api/admin/auth/route.ts` |
| Logout (form POST) | `src/app/admin/AdminNav.tsx:114`, `src/app/api/admin/auth/logout/route.ts` |
| Session expiry: admin API 401 shows "session expired" | `src/lib/admin/api-client.ts:34` |
| Admin and partner sessions can't be swapped | `src/lib/auth/session.ts` (`typ` claim) |
| Trial and past-due banners, Plan page, cancel in trial and after | `src/app/admin/BillingBanner.tsx`, `src/app/admin/plan/*`, `src/lib/billing/flow.ts` |
| Plan change when the room count changes (on the Plan page) | `/api/admin/billing/rooms`, `flow.ts` (but see #11) |
| Webhook signatures and run-once handling | `src/lib/billing/webhooks.ts`, `billing_events` |
| Calendar feeds per hotel, with sync status and errors shown | `src/app/admin/settings/calendars/CalendarFeeds.tsx` |
| Booking alerts to the hotel, defaulting to the sign-up email | `src/lib/alerts/*` |
| Support contact `hello@abeiku.com` on the landing page (6 times), sign-up and Plan pages; the forwarder works | live page; UPLINK.md 11:50 |
| Mobile admin layout (F1) | `docs/f1-2026-11-15` screenshots; not re-checked live (no login) |
| HTTPS + HSTS | live header `strict-transport-security: max-age=31536000` |
| Page title, description, OG text | `src/app/layout.tsx`, live `/` |

## Not checked / unsure

- Netlify production env (`JWT_SECRET`, `CRON_SECRET`, billing vars): I didn't read it, to stay read-only and keep secrets out of logs.
- Supabase plan and backups (#18), and the Supabase data region.
- Stripe Automaddie dashboard: dunning, receipts, customer emails, descriptor (#4, #5, #10, #23).
- Paystack: whether it disables subscriptions by itself after failed charges (#4), and whether the manage-link API is still current (#6).
- Whether the Google OAuth app is verified (#21).
- Ghana Data Protection Act registration: needs a lawyer or the Data Protection Commission (#3).

## For Harrison to decide

1. **#9:** reword "partner tracking" on the landing page now, or build it for every hotel.
2. **#3:** the refund and cancellation terms (suggest: cancel any time, access to the end of the paid month, no refunds for part-months).
3. **#4:** the grace period after a failed payment (suggest 14 days, then blocked until the card is updated).
4. **#10:** keep Stripe on Automaddie with an "ABEIKU" descriptor, or open a separate Abeiku Stripe account before going live.
5. **#18:** Supabase Pro (paid) or a self-run nightly dump.
