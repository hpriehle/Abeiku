# Abeiku audit — origin/main `5c14436` (live on abeiku.com, 2026-11-14)

Audited 2026-11-15. Report only: no code changed, no production writes, nothing deployed.
Screenshots (375px and 1280px) are in this folder; file names are given as `[shot: name]`.

---

## One-screen summary (for non-developers)

**What Abeiku can really do today**

- **Partner portal: works.** Partners can log in, see their link, totals and bookings. Hotel staff can add partners, generate setup links and mark commissions paid. The 44 automated tests for commission and booking reports pass.
- **Hotel admin: mostly works on a laptop.** Dashboard, bookings, rooms, partners, reviews and settings load. It **cannot be used on a phone**, and the **Log out button does not work**.
- **Public booking widget: works.** `abeiku.com/widget/aracuya` shows rooms and availability. "Book" opens a pre-filled WhatsApp message.
- **WhatsApp booking bot (the core product): not live for any hotel.** Neither hotel in the database has a WhatsApp number connected. The "Connect WhatsApp" page says "not available yet, contact support" because the Meta app keys are not set.
- **Payments: never used.** The `payments` table has 0 rows. The code for Paystack (card and MoMo) exists but has never run end to end in production.
- **Automatic reminders and review requests: never run.** Nothing calls the cron job (`templates_sent` has 0 rows), and the review link it would send is broken.
- **Home page waitlist: fake.** It shows "You're on the list!" and throws the email away.

**The 10 most important problems, worst first**

| # | Problem | Who is hit | Fix size |
|---|---|---|---|
| 1 | **A partner can open the hotel admin with their own login.** Partner and admin sessions are signed with the same key and nothing checks which kind they are. I confirmed it on a local build: a partner session put in the admin cookie loads `/admin/dashboard` (200) and `/api/admin/payments` (200). That covers bookings, guest chats, payout settings, and marking their own commission "paid". | Every hotel with partners (Aracuya has 52) | S |
| 2 | **Admin "Log out" does nothing.** It lands on a blank 405 page and the session cookie stays. | Hotel staff | S |
| 3 | **Partner "Log out" shows raw `{"success":true}`** (already known). | Partners | S |
| 4 | **Anyone can fake a MoMo payment.** `/api/momo/callback` has no authentication. A POST with a payment reference marks the booking paid, records platform fees and triggers a real MTN payout to the hotel, again on every replay. The route is not used by the real payment flow, so it can simply be removed. | Money | S |
| 5 | **Hotel secrets are sent to the browser.** The Settings page passes the whole hotel row (WhatsApp access token, Stripe keys, MoMo verification amount) to the page. `/api/admin/hotel` returns the MoMo verification amount, which defeats the "prove you own this number" check. Together with #1, a partner could read them. | Hotels | S |
| 6 | **The WhatsApp bot is not connected, and its webhook is open.** No hotel has a WhatsApp number. The Meta keys (`WHATSAPP_APP_ID/SECRET/CONFIG_ID`) are not set. The webhook does not check Meta's signature, so anyone can forge guest messages. `/api/booking/dates` lets anyone make the bot message any phone number. | The core product | M |
| 7 | **Bookings are "Confirmed" before payment**, and unpaid ones block the room forever. Cancelling tells the guest a refund is coming, but no refund is ever made. Duplicate bookings happen: test-hotel has two identical ones `[shot: admin-bookings-1280]`. | Guests, hotels | M |
| 8 | **Reminders and review requests never go out.** No scheduler exists on Netlify. `CRON_SECRET` is unset, so the cron URL is open to anyone. The review link is built as `https://undefined/...`. Most messages would also break WhatsApp's 24-hour rule. | Hotels | M |
| 9 | **Partner tracking is only half connected.** All partner links point to `aracuya.com`, whatever the hotel. 0 link clicks are recorded. 50 of 52 partners have no password yet, and setup links must be sent by hand. A partner who forgets their password has no reset. | Partners | M |
| 10 | **Hard to read and not mobile-ready.** Light grey text on white is used 93 times in 36 files (`text-gray-400`, about 2.6:1 contrast, below the 4.5:1 minimum). The admin sidebar leaves about 120px for content on a phone `[shot: admin-dashboard-375]`. Lint fails with 8 errors. | Everyone | M |

**Proposed order of fixes**

**A — partner flow, must be solid this week**
1. Separate partner and admin sessions: add a `typ` claim, or use separate secrets, and check it in `middleware.ts` and `getSession()`. — S
2. Partner logout: redirect to `/partner/login` instead of returning JSON. — S
3. Admin logout: make it a POST that redirects. — S
4. Delete `/api/momo/callback` (unused, exploitable). Also delete or lock `/api/momo/disbursement-callback`. — S
5. Stop sending secrets to the browser: pass only the fields the Settings page needs, and strip `momo_verification_*` and tokens from `/api/admin/hotel`. — S
6. Partner links per hotel: build them from the hotel (or set `ARACUYA_URL` per hotel), not a global aracuya.com fallback. — S
7. Partner password reset: let the admin re-issue a setup link even when a password exists, plus a "Forgot password? Ask your hotel" note. — S
8. Confirm aracuya.com sends `visit` and `booking` reports (0 clicks today). Fix CORS and the visit-route origin list if not. — S–M (depends on the aracuya site)
9. Partner pages polish: redirect `/partner` and a signed-in `/partner/login` to the dashboard, fix grey-on-grey text, add a clipboard copy fallback. — S
10. Set `CRON_SECRET` on Netlify now, so the open cron URL closes even before scheduling exists. — S (Netlify setting, no code)

**B — foundation for the hotel-management app**
1. Responsive admin shell (collapsible sidebar), plus a contrast pass that replaces `text-gray-400`/`#999` on light backgrounds. — M
2. Booking life cycle: create bookings as "pending payment" and confirm only on a verified payment. Expire unpaid holds. Recheck availability at confirmation. Guard against double taps. Make the Paystack webhook idempotent with an atomic status change and an amount check. — L
3. Real refunds, or stop promising them (cancel flow in the bot and the admin booking modal). — M
4. WhatsApp: set the Meta env vars, verify `X-Hub-Signature-256`, dedupe on message id, connect one hotel. Lock down `/api/booking/dates` (signed link token instead of a raw phone). — M
5. Scheduler: a Netlify scheduled function for `/api/cron/lifecycle`. Fix the review URL bug. Use approved WhatsApp templates for messages outside the 24h window. — M
6. Admin error handling: booking modal, room delete/reorder, template editor and notification toggles all hide failures. Fix the room edit that wipes multi-room pricing. — M
7. Get lint green and add tests around payments and the booking state machine. — M
8. Login hardening: rate limits on admin and partner login, an attempt limit on MoMo verification, a `state` parameter on Google OAuth. — S–M

**C — later**
- Real waitlist (store emails) and refresh the home page demo (it still says "Feb 14–16, 2026"). — S
- Remove dead code: `/api/availability`, unused admin APIs, `test-embed.html`, create-next-app SVGs, the `/admin/settings/notifications` page, the "Dev: Run Onboarding" button. — S
- Payments list pagination, inbox search debounce, template-message sending from the inbox. — M
- Restrict `next.config.ts` image `remotePatterns` (currently any host). — S
- Rename `middleware.ts` to `proxy.ts` (Next 16 deprecation warning). — S

**Harrison must decide or confirm:** (a) Is `PAYSTACK_WEBHOOK_SECRET` set on Netlify? It is under `PAYSTACK_*`, but it must equal the Paystack secret key or every payment webhook is rejected. (b) Is `MOMO_ENVIRONMENT` set to `production` on Netlify? It is `sandbox` in `.env.local`. (c) Has aracuya.com actually been wired to call the referral `visit`/`booking` APIs? There are 0 clicks and 2 referral bookings in prod. (d) Should hotels with a "momo" payout get paid by both the Paystack subaccount split and a separate transfer? The code does both (see Payments).

---

## How this audit was done

| Check | Command | Result |
|---|---|---|
| Tests | `npm test` | **pass**: 3 files, 44 tests (`booking-report`, `bulk`, `commission`; partner code only) |
| Lint | `npm run lint` | **fail**: 8 errors, 24 warnings (list below) |
| Types | `npx tsc --noEmit` | pass |
| Build | `npm run build` | **pass** (one warning: `middleware` file convention deprecated, use `proxy`) |
| Live pages | Playwright/Chromium against https://abeiku.com, GET only | 13 public pages, both widths |
| Logged-in pages | `next start` of this commit on localhost:3123 against prod Supabase, with session cookies signed locally with `JWT_SECRET`. Admin = test-hotel admin; platform page = Aracuya platform_admin; partner = `zz-qa-login`. | 20 admin pages and the partner dashboard, both widths. No forms submitted. |
| DB | Service-role REST `select`/`count` only | Counts quoted below. Nothing written. |

Lint errors:
- `src/app/admin/communication/inbox/InboxTab.tsx:82`, `:88` — setState inside effect
- `src/app/admin/communication/inbox/MessageThread.tsx:84` — reassign after render
- `src/app/admin/onboarding/page.tsx:58` — prefer-const
- `src/app/admin/settings/momo/MoMoForm.tsx:57` — setState inside effect
- `src/app/widget/components/CurrencyContext.tsx:47` — setState inside effect
- `src/components/PhoneChat.tsx:155` — variable used before declared
- `src/lib/whatsapp/state-machine.ts:1283` — `useReferralCode` treated as a React hook. This is a false positive caused by the name; rename the function.

Production data snapshot (counts only):
- `hotels` 2 (aracuya, test-hotel), both with `whatsapp_phone_number_id = null`
- `influencers` 52 (all Aracuya; 50 without email; 2 with a password)
- `influencer_clicks` 0
- `referral_bookings` 2, `referral_booking_events` 4
- `bookings` 4, `payments` 0
- `conversations` 8, `templates_sent` 0

Env vars. On Netlify per brief: set = `ANTHROPIC_API_KEY MOMO_* PAYSTACK_* GOOGLE_OAUTH_* GOOGLE_PLACES_API_KEY JWT_SECRET SUPABASE_* NEXT_PUBLIC_APP_URL WHATSAPP_VERIFY_TOKEN RESEND_API_KEY ABEIKU_REFERRAL_SECRET ABEIKU_ADMIN_API_SECRET`; **not set** = `WHATSAPP_APP_ID WHATSAPP_APP_SECRET WHATSAPP_CONFIG_ID` (and `NEXT_PUBLIC_WHATSAPP_APP_ID/CONFIG_ID`), `CRON_SECRET`, `ARACUYA_URL`. Also read by code but not in the brief: `PAYSTACK_WEBHOOK_SECRET` (presumably under `PAYSTACK_*`), `MOMO_ENVIRONMENT`, `GOOGLE_CALENDAR_ID`/`GOOGLE_API_KEY` (dead route only), `VERCEL_URL` (bug, see lifecycle). No `netlify.toml` and no scheduled functions exist in the repo.

Status words: **works** / **half-built** / **broken** / **dead** (unreachable or unused) / **placeholder**.

---

## 1. Security

| Severity | Finding | Where |
|---|---|---|
| Critical | **Partner token accepted as admin session.** Both use `JWT_SECRET` with HS256 and no type, audience or issuer claim. `middleware.ts` only verifies the signature. `getSession()` casts any payload to `SessionPayload`; a partner payload has `hotelId`, so every `/api/admin/**` route accepts it (they only check `if (!session)`). Only `platform_admin` routes are safe, because `role` is undefined. **Verified locally**: partner cookie value set as `admin_session` → `/admin/dashboard` 200, `/api/admin/payments` 200 (without it: 401). | `src/middleware.ts:22`, `src/lib/admin/auth.ts:34-40`, `src/lib/partner/auth.ts:5,32-38` |
| Critical | **Forgeable MoMo payment callback.** No signature or token. It trusts `body.status === "SUCCESSFUL"`, never re-checks with MTN, has no idempotency and no amount check. It marks the booking paid, records earnings and calls MTN disbursement for `hotel_amount`. The lookup by `provider_tx_id` also matches Paystack references, which the guest can see in the `?ref=` of their callback URL. Direct MTN collection (`requestPayment`) is never called, so the route is dead code. | `src/app/api/momo/callback/route.ts:30-94` |
| High | **WhatsApp webhook unsigned.** `X-Hub-Signature-256` is never checked (and `WHATSAPP_APP_SECRET` is unset). Forged messages can drive the bot as any phone number. There is also no dedupe on `message.id`. | `src/app/api/whatsapp/webhook/route.ts:38-99` |
| High | **Hotel secrets in client payload.** The whole `hotels` row (`select *`) goes to `"use client"` components. Verified in the rendered HTML: `whatsapp_access_token`, `stripe_secret_key`, `stripe_webhook_secret`, `momo_verification_amount` and `momo_phone` keys are present (null for test-hotel). `GET /api/admin/hotel` masks only the WhatsApp token and returns `momo_verification_amount`/`_ref`. | `src/app/admin/settings/page.tsx:157-158`, `src/lib/db/index.ts:114-120`, `src/app/api/admin/hotel/route.ts:15-21` |
| High | **Open cron.** `if (cronSecret && …)` skips auth when `CRON_SECRET` is unset, as it is in prod. Anyone can trigger every reminder send and read per-hotel results. | `src/app/api/cron/lifecycle/route.ts:10-14` |
| High | **`/api/booking/dates` is an open WhatsApp relay.** It is unauthenticated, and `phone` and `hotel` come from the URL. It sends WhatsApp messages from the hotel's number to any phone and overwrites that phone's conversation state. `sim:true` is accepted from anyone. | `src/app/api/booking/dates/route.ts:115-246` |
| Medium | MoMo verification code has no attempt limit (one of 99 values) | `src/app/api/admin/momo/confirm-verification/route.ts` |
| Medium | `payout-preference` accepts an unverified `momo_phone` for the transfer recipient | `src/app/api/admin/paystack/payout-preference/route.ts:20-39` |
| Medium | Google OAuth has no `state` parameter, so it is open to login CSRF (attacker's calendar linked to a hotel). The `reason` query value is not encoded. | `src/lib/calendar/index.ts:197-206`, `src/app/api/auth/google/callback/route.ts:15` |
| Medium | No rate limit on admin or partner login. Admin login skips bcrypt for unknown emails, so response timing reveals which emails exist. | `src/app/api/admin/auth/route.ts:18-26`, `src/app/api/partner/auth/login/route.ts` |
| Medium | Unauthenticated `disbursement-callback` can flip disbursement and payment status | `src/app/api/momo/disbursement-callback/route.ts` |
| Low | Paystack HMAC compared with `===`, not `timingSafeEqual` | `src/app/api/paystack/webhook/route.ts:35` |
| Low | Public widget falls back to the hotel's **MoMo payout phone** for the `wa.me` link when there is no WhatsApp display number | `src/app/widget/types.ts:57` |
| Low | `/api/r/[hotelSlug]/[bookingId]` inserts a `templates_sent` row for any id, so the table can be spammed | `src/app/api/r/[hotelSlug]/[bookingId]/route.ts:17-29` |
| Low | `/api/public/referral/[slug]/visit`: CORS only limits browsers. Anyone can enumerate partner codes and inflate clicks. Origins are hardcoded to aracuya.com and localhost:3001. | `src/app/api/public/referral/[hotelSlug]/visit/route.ts:6-12` |
| Low | `momo.ts` logs the disbursement user id and the first 8 characters of the subscription key | `src/lib/payments/momo.ts:55-56` |
| Low | `next.config.ts` image `remotePatterns` allows any https host | `next.config.ts:15` |
| Info | **Secrets in client bundles: none found.** The service-role key is only used server-side (`src/lib/supabase/client.ts`). The `NEXT_PUBLIC_*` vars are the app URL and the WhatsApp app/config IDs, which are not secret. | |
| Info | **RLS:** enabled on all tables except `review_count_snapshots` (`supabase-migration-review-tracking.sql`). No policies are defined, so the anon key gets nothing. The app always uses the service-role key, so **tenant isolation relies only on `hotel_id` filters in code**. No cross-hotel IDOR was found: `db/index.ts` helpers filter by `hotel_id`, and the partner routes check `partner.hotel_id === session.hotelId`. | |
| Info | Server-to-server APIs are fine: `/api/admin/partners`, `/api/admin/partners/bulk` and `/api/public/referral/*/booking` use constant-time Bearer checks and fail closed when the secret is unset | `src/lib/partner/booking-report.ts:82-90` |

---

## 2. Partner flow (group A)

| Step | Status | What happens / what is wrong |
|---|---|---|
| Admin creates partner (`/admin/influencers`) | works | `[shot: admin-partners-1280]`. Errors use `alert()` (`InfluencersClient.tsx:49,423`). Copy has no failure feedback. Empty states are `text-gray-400`. Mobile: unusable shell (see Admin). |
| Bulk import (`POST /api/admin/partners/bulk`) | works | Bearer `ABEIKU_ADMIN_API_SECRET` (set). Generates codes and setup links. 52 partners exist. |
| Setup link (`POST /api/admin/influencers/[id]/setup-link`) | works | Returns `NEXT_PUBLIC_APP_URL/partner/setup?token=…` with TTL `INVITE_TTL_MS`. The link must be sent to the partner by hand; there is no WhatsApp or email sending. **Returns 409 once a password exists, so a partner who forgets their password cannot get back in.** (`route.ts:17-19`) |
| `/partner/setup?token=` | works | `[shot: partner-setup-notoken-375]`. Without a token, the form still shows and only fails on submit. Errors are readable ("Invalid or used invite link", "expired"). The subtitle is `text-gray-400` on navy (OK). |
| `/partner/login` | works | `[shot: partner-login-375]`. Accepts email or WhatsApp number. No "forgot password". A partner who is already signed in still sees the form, with no redirect (`[shot: partner-login-when-signed-in-1280]`). |
| `/partner` | dead | 404 `[shot: partner-root-375]`. It should redirect to the dashboard or login. |
| `/partner/dashboard` | works | `[shot: partner-dashboard-375]`, `-1280`. It has loading, error and empty states. Contrast: hints and the empty state are `text-gray-400`/`500` on white (`dashboard/page.tsx:106,158`). Copy uses `navigator.clipboard` with no try/catch (`:50`), so it fails silently on old browsers. Error message is generic. Partners see no guest amounts, by design. |
| Referral link | half-built | Always `https://aracuya.com/?ref=CODE`, because `ARACUYA_URL` is unset and its fallback is hardcoded (`src/lib/partner/views.ts:14,25-26`). That is correct for Aracuya today, wrong for any other hotel. |
| Click tracking (`POST /api/public/referral/aracuya/visit`) | unverified / likely not wired | `influencer_clicks` has 0 rows. Either aracuya.com does not call it, or nobody has clicked. |
| Booking report (`POST /api/public/referral/aracuya/booking`) | works | 2 bookings and 4 events recorded. Commission logic is covered by tests. |
| Mark payout (`POST /api/admin/influencers/bookings/[id]/payout`) | works | Checks hotel ownership. With issue #1, a partner could call it for their own bookings. |
| Partner logout | **broken** | A form POST to `/api/partner/auth/logout` returns JSON, so the user lands on raw `{"success":true}` `[shot: partner-logout-result-375]`. The cookie *is* cleared. A GET on the same URL returns 405. (`src/app/api/partner/auth/logout/route.ts:4-7`, `src/app/partner/(gated)/layout.tsx:29`) |

Env needed: `JWT_SECRET`, `SUPABASE_*`, `NEXT_PUBLIC_APP_URL`, `ABEIKU_REFERRAL_SECRET`, `ABEIKU_ADMIN_API_SECRET` (all set); `ARACUYA_URL` (unset, falls back to aracuya.com).

---

## 3. Hotel admin

**Shell and auth**
- `/admin/login` — works `[shot: admin-login-375]`.
  - The login page is rendered inside the admin layout, so the sidebar markup sits hidden behind it (`src/app/admin/layout.tsx` wraps every `/admin/*` page).
  - Unauthenticated `/admin/*` pages redirect to login (`[shot: admin-unauth-375]`).
  - The middleware does not cover `/api/admin/*`. Each route checks the session itself, and all do, except the Bearer-secret partner APIs, by design.
- **Logout — broken.**
  - The button uses `formMethod="DELETE"`, which browsers don't support, so it sends `GET /api/admin/auth?`. That returns **405 with a blank page, and the `admin_session` cookie stays set**. Verified by clicking it `[shot: admin-logout-result-1280]`.
  - Code: `src/app/admin/layout.tsx:46-53`, `src/app/api/admin/auth/route.ts:51`.
- **Mobile — broken on every admin page.** The sidebar is a fixed `w-64` with no breakpoint (`layout.tsx:22`) and pages use `p-8`, leaving about 120px of content at 375px `[shot: admin-dashboard-375]`.
- **`/admin` — works.** It redirects to onboarding when the hotel has no rooms (test-hotel → `/admin/onboarding`), so a hotel that deletes all its rooms is sent back into onboarding.
- **Nav icons:** emoji render as empty boxes where the system has no emoji font (seen in headless Chromium). Minor; SVG icons would be safer.

**Pages**

| Page | Status | Notes (file:line) |
|---|---|---|
| Onboarding `/admin/onboarding` | half-built | Rooms are POSTed one by one, so a partial failure plus retry duplicates rooms (`page.tsx:182-195`). Google Places errors are swallowed (`:231,248`). The WhatsApp token field is plain text with no label (~`:576`), and it is the only way to connect WhatsApp today. Leaflet icons load from unpkg. |
| Dashboard | works | `[shot: admin-dashboard-1280]`. Reads Google Calendar on every render (`page.tsx:52`). Failed month changes keep the old data with no error (`BookingCalendar.tsx:63-70`, `RoomAvailabilityGrid.tsx:142-150`). The grid is `min-w-[800px]`. `text-gray-400` sub-text. |
| Bookings | works, defects | `[shot: admin-bookings-1280]` shows two identical test bookings for a deleted room, displayed by slug. Phone numbers are `text-gray-400` (`BookingsTable.tsx`). `page`/`status` params are not validated (`page.tsx:21-22`). Pagination shows every page number. The modal ignores failed actions with no message (`BookingDetailModal.tsx:82,96-139`) and calls `onClose()` during render (~`:150`). |
| Booking edit API `PUT /api/admin/bookings/[id]` | works, unsafe | No date validation (`:106`, negative price possible). No availability check. A missing pricing tier gives price 0. Admin can set `payment_status: paid` by hand (`:141`). Cancel sets "refunded" with no money moved (`:159-161`). |
| Rooms | works, defects | Editing a room replaces `pricing_tiers` with a single tier, so multi-room pricing is lost and empty price becomes 0 (`RoomFormModal.tsx` ~`:185`). Delete and reorder ignore errors (`RoomTable.tsx:92-97,107`). Upload failures are skipped silently (`RoomFormModal.tsx:45`). Delete is soft and doesn't check future bookings. |
| Communication → Inbox | works, defects | Fixed `w-80` list, no mobile layout. Search fetches on every keystroke with no debounce and races (`InboxTab.tsx:168`). No error handling on the message fetch (`:93`). The 24h-closed notice says "use a template message", but there is no way to send one (`ReplyBox.tsx:47`). Opening a thread is a GET that writes (resets unread, `api/admin/chats/conversations/[id]/messages/route.ts:29`). |
| Communication → Templates | half-built | After saving, the list shows the old text until reload (`TemplateEditor.tsx:21,46-52`). Toggle ignores failures (`:68-82`). The table has no horizontal scroll on mobile (`:86`). The "set up WhatsApp" link goes to `/admin/settings` instead of `/admin/settings/whatsapp`. |
| Communication → Report | works | Empty data shows "AI Success Rate 100%" (`report/page.tsx:33`). A DB error silently shows zeros. |
| Reviews | works | Funnel swallows errors (`ReviewFunnel.tsx:26`). Google reviews errors are shown. Many grey empty states. |
| Payments | works, incomplete | First 50 only, no pagination (`payments/page.tsx`). `GET /api/admin/payments` (which supports paging) is unused. 0 payments in prod. |
| Settings (main) | works, defects | `[shot: admin-settings-1280]`. **"Dev: Run Onboarding" button live** (`settings/page.tsx:145-151`), which can duplicate rooms. **Secrets passed to client** (`:157-158`). Google OAuth returns `?calendar=connected|error` here, but the page ignores it, so there is no feedback. Changing the country silently flips the currency (`SettingsForm.tsx:67`). lat/lng are saved as 0 when unset (`:19-20`). Labels have no `htmlFor`. |
| Settings → WhatsApp | **broken (dead end)** | `[shot: admin-settings-whatsapp-1280]` shows "WhatsApp connection is not available yet. Please contact support." `NEXT_PUBLIC_WHATSAPP_APP_ID/CONFIG_ID` are unset (`EmbeddedSignup.tsx:36-37,145-153`). The manual form only shows once connected (`page.tsx:57`). Even with those set, the callback needs `WHATSAPP_APP_ID/SECRET` (`api/auth/whatsapp/callback/route.ts:30-39`) and hard-codes PIN `123456` (`:94`). |
| Settings → Google Calendar | works | Needs `GOOGLE_OAUTH_*` and `NEXT_PUBLIC_APP_URL` (set). No OAuth `state`. `GET /api/admin/calendar` returns 500 when the token is revoked. |
| Settings → Google Reviews | works | Needs `GOOGLE_PLACES_API_KEY` (set). |
| Settings → MoMo | works, insecure | Verification amount is leaked (see Security). Raw upstream error text appears in `Failed to send verification: …` (`send-verification/route.ts:91-94`). |
| Settings → Paystack | works | `create-subaccount` overwrites an existing one with no confirmation. |
| Settings → Notifications `/admin/settings/notifications` | dead | Not linked; the same component is embedded in Settings. A toggle shows "saved" even when the server rejects it (`NotificationSettings.tsx:51-62`). |
| Simulator | works | Runs the real state machine against the prod DB (creates real booking rows for the typed phone). Errors are shown as `Error: ${String(error)}` (`api/admin/simulator/route.ts:83`). |
| Partners | works | See Partner flow. |
| Platform | works | `[shot: admin-platform-1280]`. The role is checked server-side, and non-admins are redirected to the dashboard (`[shot: admin-platform-nonadmin-1280]`). Currency is hardcoded GHS. `/api/admin/platform/*` routes are unused. |

**Dead admin APIs (never called):** `GET /api/admin/payments`, `GET /api/admin/paystack`, `GET /api/admin/chats/stats`, `GET /api/admin/platform/stats`, `GET /api/admin/platform/earnings`.

**Other admin API notes:**
- `PUT /api/admin/templates` does not validate `templateType`.
- `/api/admin/chats/reply` with `type:"template"` skips the 24h check and then sends plain text (`:48,64`).
- The conversations `search` string is interpolated into a PostgREST `.or()` filter (`db/index.ts:1792`). It is still hotel-scoped.
- `PATCH /api/admin/hotel` accepts any `whatsapp_phone_number_id` with no uniqueness check, so a hotel could claim another hotel's inbound messages (unverified).

**Signup `/signup` + `POST /api/signup` — works** `[shot: signup-375]`.
- After signup the user is sent to login, not signed in.
- No email verification and no rate limit.
- If creating the admin user fails, the hotel row is not rolled back (`api/signup/route.ts:44-62`).
- **Anyone can create a hotel account.** Harrison should decide whether signup stays open.

---

## 4. Public pages

| Page | Status | Notes |
|---|---|---|
| `/` home | placeholder | `[shot: home-1280]`, `home-375`. The waitlist form is fake: `// TODO: POST to /api/waitlist`, it waits 800ms then shows success, and the email is lost (`src/components/WaitlistForm.tsx:14-17`). The phone demo is hardcoded to Aracuya, "Feb 14–16, 2026", GH₵900 (`src/components/PhoneChat.tsx:46,149,228`). The "Log in" link goes to `/admin/login` (OK). Footer text is light grey. |
| `/widget/aracuya` | works | `[shot: widget-aracuya-375]`, `-1280`. Rooms, gallery, USD/GHS toggle. "Book" is a pre-filled `wa.me` text, not the booking API. An empty phone gives `https://wa.me/?text=…` (`BookingWidget.tsx:71`). |
| `/widget/test-hotel` | works | Empty state "No Rooms Available" `[shot: widget-test-hotel-375]`. |
| `/widget/[slug]/rooms/[roomSlug]` | works | Not screenshotted separately. |
| `/widget/aracuya/embed` | works | `[shot: widget-embed-375]`. Fires one availability request per room for 90 days on load (`EmbedClient.tsx:86-107`). A failed fetch is treated as "all available" with no error (`:101-103`). `getWhatsAppUrl` returns `"#"` when nothing is selected (`:168`). |
| `public/embed.js` + `test-embed.html` | works / leftover | `test-embed.html` is a debug page pointing at `abeiku.netlify.app` (`:24`). The create-next-app SVGs in `public/` are unused. |
| `/booking/dates?hotel=&phone=` | works, abusable | `[shot: booking-dates-375]`. Without params it still renders and only fails on submit. The phone number sits in the URL. Spinner uses `border-3`, which may not exist in Tailwind (`page.tsx:10`). Backed by the open `/api/booking/dates`. |
| `/booking/payment-callback?ref=` | works, defects | `[shot: payment-callback-375]` shows "Invalid Link" without a ref. On a verify error it prints `err.message`, which contains the **raw Paystack JSON** (`page.tsx:35,55` + `paystack.ts:127-130`). A network error shows "Payment Failed" even when payment succeeded. `#999` sub-text (`:104`). |

**Public APIs**

| Route | Status | Notes |
|---|---|---|
| `GET /api/widget/[slug]/availability` | works | CORS `*`, dates only, no PII. Counts only `confirmed`/`checked_in` (`:60`). Ignores unit counts, manual blocks and Calendar. Unpaid "confirmed" bookings block dates. |
| `GET /api/availability` | dead | Single-tenant leftover. `GOOGLE_CALENDAR_ID`/`GOOGLE_API_KEY` are unset, so it always returns `[]`. |
| `POST /api/booking/dates` | works, insecure | See Security. `totalPrice = (tier?.price ?? 0) * nights` (`:302-303`), so a missing tier gives 0. |
| `POST /api/public/referral/[slug]/visit` | works | See Partner flow and Security. |
| `POST /api/public/referral/[slug]/booking` | works | Bearer, constant time, fails closed. |
| `GET /api/r/[slug]/[bookingId]` | works, unreachable | Redirects to the Google review page. The links pointing here are built wrong (lifecycle bug), so nobody reaches it. The place id is not URL-encoded (`:31`). |
| `POST /api/signup` | works | See Admin. |

---

## 5. WhatsApp bot, payments, cron

**WhatsApp webhook `/api/whatsapp/webhook` — works in code, not live.**
- **Needs:** `WHATSAPP_VERIFY_TOKEN` (set), a per-hotel `whatsapp_phone_number_id` and access token in `hotels` (**both null for both hotels**), and `ANTHROPIC_API_KEY` (set) for free text.
- **The GET verify fails closed.** POST resolves the hotel by `phone_number_id`. With no hotel connected, every message is logged as "No hotel found" and dropped.
- **Errors are swallowed:** every error returns 200 (`:94-98`).

**Bot booking flow (`src/lib/whatsapp/state-machine.ts`)**
- **Flow:** `handleMessage` `:96` → dates → room → guest name `:948` → `handleConfirmBooking` `:1261` → payment buttons.
- **Booking rules:**
  - "Booking Confirmed!" is sent before payment (`:1357`), with the row created as `confirmed` + `unpaid` (`:1282`). "Pay Later" leaves it like that forever (`:290`).
  - Availability is checked when rooms are listed (`:645`), not at confirmation, so two guests can both confirm the last room.
  - Nothing stops a double tap on confirm, which creates duplicate bookings.
  - The referral code is used up before the booking insert succeeds (`:1278`).
- **Payment and cancellation:**
  - `getActiveBooking` returns only the earliest booking (`db/index.ts:410`), so payment fails for a later or second booking (`:1757-1760`).
  - Cancel sets `refunded` and tells the guest a refund is coming, but no refund call exists (`:1640-1650`).
  - Review ratings don't check that the booking belongs to the sender (`:1680`).
- **Guest text** is sent to Claude (`handleFreeText` `:2036`), so prompt injection is possible. The impact is limited to the reply text (unverified).

**Paystack — half-built (never used in prod: 0 payments)**
- **Checkout:** card and MoMo charges are initialised with a hotel `subaccount` and `bearer: subaccount` (`paystack.ts:50,78-82`, `paystack-momo.ts:55-56`).
- **Webhook `/api/paystack/webhook`:**
  - **Needs `PAYSTACK_WEBHOOK_SECRET`.** If it is unset, every event gets a 400 (`:29`). Paystack signs with the secret key, so the value must equal `PAYSTACK_SECRET_KEY`. **Harrison to confirm.**
  - HMAC-SHA512 is checked correctly (`:34`).
  - Idempotency is check-then-act (`:79`), so a concurrent retry can double-run the payout.
  - No amount or currency check.
  - **Possible double payout:** for `payout_method = momo`, the subaccount split already pays the hotel, and the webhook also calls `initiateTransfer(hotel_amount)` (`:113-121`). Unverified; it depends on the subaccount setup, and Harrison should decide.
  - `charge.failed` sends the raw `gateway_response` to the guest on WhatsApp (`:189`).
  - Refund and dispute events are not handled.
- **Env:** `PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY`, `PAYSTACK_WEBHOOK_SECRET` (`PAYSTACK_*` set), `NEXT_PUBLIC_APP_URL` (callback URL).

**MTN MoMo direct**
- **Status:**
  - Collection is **dead**: `requestPayment` (`momo.ts:87`) is never called.
  - The callback is **exploitable** (see Security).
  - Disbursement code is used only by that callback.
  - Admin MoMo *verification* (`send-verification`, a small disbursement to prove number ownership) is live.
- **Env:** `MOMO_COLLECTIONS_*`, `MOMO_DISBURSEMENTS_*`, `MOMO_ENVIRONMENT` (`sandbox` in `.env.local`; sandbox forces EUR, `momo.ts:125`). **Harrison to confirm the Netlify value.**

**Cron `/api/cron/lifecycle` — half-built / not running**
- **Nothing calls it:** there is no `netlify.toml` and no scheduled function. The comment refers to Vercel Cron. `templates_sent` has 0 rows.
- **Open to anyone** while `CRON_SECRET` is unset (`route.ts:14`).
- **Review link bug** (`src/lib/lifecycle/index.ts:176-178`): `NEXT_PUBLIC_APP_URL || VERCEL_URL ? https://${VERCEL_URL} : localhost` produces `https://undefined/api/r/…` on Netlify.
- **WhatsApp rules:** all sends are free-form text or buttons. Messages more than 24h after the guest's last message (pre-arrival, review, 5-day photo, 30-day return offer) need approved templates, so Meta will reject them.
- **Timing and targets:** wake-up calls need a poll every few minutes, which a once-a-day cron can't do. Reminders also go to unpaid bookings.

**Notifications (email via Resend)** — `RESEND_API_KEY` set. Owner notifications are sent from the payment paths. Not exercised (0 payments).

---

## 6. Design and readability

- **Grey on grey:** `text-gray-400` appears 93 times in 36 files under `src/app` and `src/components`. In Tailwind v4 this is about `#99a1af`, roughly 2.6:1 on white and 2.5:1 on `gray-50`, below WCAG AA (4.5:1) for body text. Worst spots:
  - admin stat sub-text, table timestamps and phones, every empty state;
  - partner dashboard hints and empty state;
  - home footer;
  - payment-callback `#999`.
- **Mobile:**
  - Public pages, partner pages and login pages are fine at 375px, with no horizontal overflow measured.
  - The admin area is not usable on a phone.
- **Feedback states:** many admin actions fail silently (listed per page above). The partner dashboard and widget pages do have loading, empty and error states.

---

## Screenshot index

Public, live abeiku.com:
- `home`, `signup`, `admin-login`, `admin-unauth`
- `partner-login`, `partner-setup-notoken`, `partner-root` (404), `partner-dash-unauth`
- `widget-aracuya`, `widget-test-hotel`, `widget-embed`
- `booking-dates`, `payment-callback`

Partner, local build of this commit with a signed session:
- `partner-dashboard`, `partner-login-when-signed-in`, `partner-logout-result` (raw JSON)

Admin, local build with a test-hotel admin session:
- `admin-root` (→ onboarding), `admin-dashboard`, `admin-bookings`, `admin-rooms`
- `admin-inbox`, `admin-templates`, `admin-report`, `admin-reviews`, `admin-payments`
- `admin-settings`, `admin-settings-whatsapp`, `admin-settings-google`, `admin-settings-google-reviews`
- `admin-settings-momo`, `admin-settings-paystack`, `admin-settings-notifications`
- `admin-simulator`, `admin-partners`, `admin-platform-nonadmin`
- `admin-logout-result` (blank 405)

Platform, Aracuya platform_admin session: `admin-platform`.

Each name has a `-375.png` and a `-1280.png`, except `partner-logout-result` (375 only) and `admin-logout-result` (1280 only).
