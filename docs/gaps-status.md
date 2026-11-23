# Gaps status: items #1–#21 of `docs/gaps-audit.md`

Checked 2026-11-23 against `origin/chat/abeiku-l3-billing` 913c0d4 (includes main, PRs #1–#26), plus this
branch (`chat/abeiku-gaps-close`). Code only: no live SQL, no logins, no Netlify or dashboard reads.

| # | Gap | Status | Evidence | What's left |
|---|---|---|---|---|
| 1 | Forgot password | done | PR #5; `src/app/admin/forgot-password`, `src/app/api/admin/auth/reset/route.ts` | — |
| 2 | Billing not live | open (setup) | `src/lib/billing/providers.ts:92` refuses live keys without `BILLING_LIVE` | Live plans/prices/webhook + `BILLING_LIVE=true` (Needs Harrison) |
| 3 | Terms, Privacy, Refunds | done | PR #7; `src/app/terms`, `privacy`, `refunds`, `data-deletion`; checkbox `src/app/signup/SignupWizard.tsx:209`; `src/lib/billing/terms.ts` (`docs/go-live-terms.sql`) | Ghana DPA registration question (lawyer) |
| 4 | Failed payment never blocks | done | `src/lib/billing/access.ts:33` (`GRACE_DAYS = 14`, then locked to Plan page) | Stripe dashboard "if all retries fail" setting (`docs/go-live-billing-dashboard.md`) |
| 5 | Billing emails | done | `src/lib/billing/emails.ts`, `src/lib/billing/notices.ts:36` (welcome, trial ending, failed, cancelled, received) | — |
| 6 | Change card | done | `src/app/api/admin/billing/card/route.ts:12` | — |
| 7 | Email check, change email/password | done | verify mail at sign-up `src/app/api/signup/route.ts:35`; `src/app/admin/VerifyEmailBanner.tsx`; `src/app/admin/settings/account`; `src/app/api/admin/account/{email,password}` | Needs `docs/go-live-l3-account.sql` run live (not checked) |
| 8 | Hide features that don't work | done | `src/lib/admin/features.ts:34` (Communication, Simulator, Dev button, WhatsApp setup: only connected / platform admin / exempt `aracuya`, `test-hotel`); nav `src/app/admin/layout.tsx:29`; guards `communication/layout.tsx:9`, `simulator/page.tsx:15`, `settings/whatsapp/page.tsx:17`; onboarding block `onboarding/page.tsx:576`; this branch (commit ee63a02) | MoMo and Paystack payout tiles still show (audit listed them; not in this task) |
| 9 | Partner tracking advertised | open | `src/app/page.tsx:13,47,60` still advertise it; `docs/partner-tracking.md` | Needs Harrison |
| 10 | Stripe shows "Automaddie" | partly | `src/lib/billing/stripe-api.ts:61` names Abeiku in description/footer; descriptor is a dashboard setting (`docs/go-live-billing-dashboard.md`) | Set the descriptor in the Stripe dashboard (Needs Harrison) |
| 11 | Paid room count vs set-up rooms | done | `src/lib/billing/room-limit.ts`, enforced `src/app/api/admin/rooms/route.ts:59`, `rooms/[id]/route.ts:47` | — |
| 12 | Favicon and 404 | done | `src/app/icon.svg`, `apple-icon.png`, `favicon.ico` (not the Next default), `not-found.tsx` (c2e8384); `src/app/error.tsx` and unused `public/*.svg` removed (ee63a02) | — |
| 13 | Alerts on cron/sync/webhook failure | partly | `opsAlert` (`src/lib/ops/alerts.ts:107`) in all 4 Netlify functions, booking-sync route, Stripe/Paystack/WhatsApp webhooks, alert sends | A job that never starts sends nothing: needs an outside heartbeat/uptime monitor (Needs Harrison). `docs/go-live-l3-ops.sql` for the shared throttle |
| 14 | Harrison can't act on a hotel | open | `src/app/admin/platform` is read-only | Needs Harrison |
| 15 | Harrison told of sign-up / cancel / failed payment | done | `notifyPlatform` → `OPS_ALERT_EMAIL`, `src/lib/billing/notices.ts:61,78,90` (+ plan ended / locked `:160,164`); tests `src/lib/billing/l3-billing.test.ts` | — |
| 16 | Restart after cancel | done | `src/app/api/signup/restart/route.ts`, `src/lib/billing/flow.ts:361`, "Start again" `SignupWizard.tsx:169` | — |
| 17 | Sessions survive a password reset | done | `admin_users.session_version` (`docs/go-live-l3-account.sql:11`), bumped `api/admin/auth/reset/route.ts:47`, `api/admin/account/password/route.ts:65`, checked `src/lib/admin/auth.ts:57`; this branch: `JWT_SECRET` required in production `src/lib/auth/session.ts:13` | Run `docs/go-live-l3-account.sql` live (until then the check fails open); confirm `JWT_SECRET` on Netlify before deploying this branch |
| 18 | Backups unknown | open | nothing in repo | Needs Harrison |
| 19 | Abandoned sign-ups | open | no job touches `pending_card` | Needs Harrison (new copy) |
| 20 | Deletion / export | partly | Privacy promises deletion within 30 days on request and 90 days after a plan ends (`src/app/privacy/page.tsx:107-108`); no tool, no CSV export | Needs Harrison |
| 21 | Two Google Calendar connections | open | onboarding OAuth block `src/app/admin/onboarding/page.tsx:558`; sync uses the service account | Needs Harrison |

## Needs Harrison

- **#2 Go live:** follow `docs/l2-signup/SETUP.md` §5 and `docs/go-live-billing-dashboard.md`, then one real sign-up with your own card and cancel it. *Recommend: do it the week before sign-up opens.*
- **#9 Partner tracking:** reword the landing lines or build it for every hotel. *Recommend: change the wording now (you supply it, e.g. "for hotels whose website we connect"), build later.*
- **#10 Stripe descriptor:** *Recommend: set "ABEIKU" as the statement descriptor on the Automaddie account now; a separate account only if Automaddie shows on receipts.*
- **#13 Heartbeat:** *Recommend: a free uptime monitor (e.g. Healthchecks.io) pinged by `booking-sync` on success, alerting after 1 hour; needs you to create the account.*
- **#14 Platform actions:** *Recommend: first only "extend trial" and "toggle exempt" on the platform table (size M); support by SQL until then.*
- **#18 Backups:** *Recommend: check the Supabase plan; if Free, move to Pro before the first paying hotel.*
- **#19 Abandoned sign-ups:** needs a new reminder email. *Recommend: one reminder after 1 day (you approve the text); delete after 30 days.*
- **#20 Deletion / export:** the Privacy page already promises 30/90-day deletion. *Recommend: keep it manual (cascade delete on `hotels` by SQL) and add "Download bookings (CSV)" later.*
- **#21 Google Calendar in onboarding:** *Recommend: remove the OAuth block from onboarding step 3 and link to Settings → Calendars, as sign-up already does.*
- **#3 Ghana Data Protection Act:** *Recommend: ask a lawyer or the Data Protection Commission whether Abeiku must register as a controller.*
- **SQL still to run live (if not done):** `docs/go-live-l3-account.sql` (#7, #17), `docs/go-live-l3-ops.sql` (#13 throttle), `docs/go-live-terms.sql` (#3). This check didn't verify which are already applied.
