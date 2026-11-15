# Partner pages polish + audit group A — branch `chat/abeiku-polish`

Base: `origin/main` 5c14436 (what is live on abeiku.com). Nothing deployed, pushed to main or merged.
No writes to the production database: logged-in pages were opened with locally signed session
cookies, and every non-GET API call in the screenshot runs was mocked or blocked
(`scripts/shots.mjs`, the context-level route at the top).

## Summary

| Audit A item | Status | Proof |
|---|---|---|
| 1. Separate partner and admin sessions | done | `src/lib/auth/session.test.ts` (12 tests) + live check below |
| 2. Partner logout ends on /partner/login | done | `src/lib/auth/logout.test.ts`, live 303, `after-partner-logout-*.png` |
| 3. Admin logout: POST + redirect, cookie cleared | done | same test, live 303, `after-admin-logout-*.png` |
| 4. Delete `/api/momo/callback`, deal with `disbursement-callback` | done (both deleted) | live `GET /api/momo/callback` → 404 |
| 5. No secrets to the browser | done | `src/lib/admin/hotel-view.test.ts` + live HTML/API check |
| 6. Partner links per hotel | done (env-based, see decision 1) | `src/lib/partner/views.test.ts` |
| 7. Admin re-issues a setup link for an active partner + "ask your hotel" note | done | `src/lib/partner/setup-link.test.ts`, `invite.test.ts`, `after-partner-login-*.png` |
| 9. Partner pages polish, `/partner` + signed-in login redirect, copy fallback | done | screenshots, axe audit, live redirects |
| Code generator bug (`(...)` and `/`) | done | `src/lib/partner/codes.test.ts` |
| 8, 10 | not mine (Maddie) | — |

Checks at the end: `npm test` 80 passed (was 44), `npm run build` passes, `npm run lint` 32 problems
(8 errors, 24 warnings), exactly the same list as on origin/main: no new lint problems.

## Commits

```
d279d84 Partners table fits 1280px (code under the name); setup page text comes from the reason
b40b105 Admin Partners page and admin shell polish
c28cee7 Partner pages polish: contrast, phone layout, friendly errors, redirects, copy fallback
20087c0 Ref codes: drop parentheticals and text after '/', cap at a word boundary
d1a62a6 Partner password reset by hand: admin can re-issue a setup link for an active partner
c0a396a Partner links per hotel instead of always aracuya.com
934f1dd Stop sending hotel secrets to the browser
6b301f0 Delete the unauthenticated MoMo callbacks
089147d Logout: partner and admin both end on their login page with the cookie cleared
90105da Separate admin and partner sessions: typ claim checked in middleware and both getSession helpers
```

## Item by item

### 1. Separate sessions (critical)
- New `src/lib/auth/session.ts`: both cookies are still signed with `JWT_SECRET`, but every token now
  carries `typ: "admin" | "partner"` and each side only accepts its own kind. Used by
  `middleware.ts`, `getSession()` (admin) and `getPartnerSession()`, so every `/api/admin/**` route
  and every `/admin` page is covered without touching the 50+ routes.
- Tokens issued before this change (no `typ`) are told apart by shape: partner tokens have
  `influencerId`, admin tokens have `userId`, never both. So existing partner sessions stop working in
  admin immediately, while admins and partners who are signed in stay signed in.
- Tests: partner token (new and old format) in the admin cookie → 401 on `/api/admin/payments` and on
  the payout route ("mark my own commission paid"); middleware sends it to `/admin/login`; admin
  token in the partner cookie → 401 on `/api/partner/stats`; admin tokens (new and old) still → 200.
- Live, local dev server against production data (GET only):
  ```
  legacy partner token in admin_session: /api/admin/payments 401, /api/admin/influencers 401, /admin/dashboard 307 → /admin/login
  new partner token in admin_session:    /api/admin/payments 401, /api/admin/influencers 401, /admin/dashboard 307 → /admin/login
  admin token (new and legacy):          /api/admin/payments 200
  ```

### 2 + 3. Logout
- Both are plain form POSTs answered with **303 to the login page** and the cookie cleared
  (`src/lib/auth/logout.ts`). Partner: same URL `/api/partner/auth/logout`. Admin: new
  `/api/admin/auth/logout` (the old button posted to the *login* route with `formMethod="DELETE"`,
  which browsers ignore, so it showed a blank 405 page and kept the session).
- Live: `POST /api/partner/auth/logout → 303 /partner/login, partner_session=; Max-Age=0`;
  `POST /api/admin/auth/logout → 303 /admin/login, admin_session=; Max-Age=0`.
- Before: `before-partner-logout-*.png` (raw `{"success":true}`), `before-admin-logout-*.png` (blank).
  After: `after-partner-logout-*.png`, `after-admin-logout-*.png` (the login pages).

### 4. MoMo callbacks
- `/api/momo/callback` deleted: unauthenticated, could mark bookings paid and trigger real MTN payouts;
  nothing calls `requestPayment`, so the real flow never used it.
- `/api/momo/disbursement-callback` deleted too, rather than locked: it only matches disbursements by
  `mtn_reference_id`, which only the deleted route ever set (Paystack payouts are stored with
  `paystack_transfer_code`). With no caller left it is dead code. `requestPayment` /
  `requestDisbursement` in `src/lib/payments/momo.ts` are now unused and still name those URLs; I left
  the library alone (MoMo is out of my scope beyond this item).
- Live: `GET /api/momo/callback → 404`.

### 5. Secrets
- New `hotelView()` (`src/lib/admin/hotel-view.ts`): an allow-list of the fields the pages use, plus
  `whatsapp_configured: boolean`. Used by `GET /api/admin/hotel` and the Settings page props
  (`SettingsForm`, `NotificationSettings`, also on `/admin/settings/notifications`).
- Gone from the browser: `whatsapp_access_token`, `whatsapp_verify_token`, `stripe_secret_key`,
  `stripe_webhook_secret`, `momo_verification_amount`, `momo_verification_ref`, Paystack codes.
- Live: rendered `/admin/settings` HTML and the `/api/admin/hotel` JSON contain none of those keys.

### 6. Partner links per hotel
- `partnerSiteUrl(hotelSlug)` in `src/lib/partner/views.ts`: `PARTNER_SITE_URLS` (JSON map slug →
  site) if set; Aracuya defaults to `ARACUYA_URL` or `https://aracuya.com` (unchanged for all 52
  current partners); **any other hotel gets no link** until its site is listed.
- Used by the partner dashboard (`/api/partner/stats`), admin Partners page and API, and the bulk
  API (`ref_link` can now be `null`). The dashboard and admin page say "no partner website set up"
  instead of showing a wrong link. Documented in `docs/partner-tracking.md`.

### 7. Password reset by hand
- `POST /api/admin/influencers/[id]/setup-link` no longer returns 409 once a password exists: it
  issues a reset link (3-day expiry instead of 14; the old password keeps working until the link is
  used). Admin page: "Active · Reset password" (asks to confirm), notice says "Password reset link
  for X, valid until 18 Nov 2026".
- Login page: "Forgot your password, or never set one? Ask your hotel for a new setup link."
- New read-only `GET /api/partner/auth/invite?token=` so `/partner/setup` says up front whether the
  link is missing, used/replaced or expired (`src/lib/partner/invite.ts`). Live:
  `{"valid":false,"reason":"invalid","message":"This setup link has already been used or was replaced by a newer one. Ask your hotel for a new link."}`

### 9. Partner pages polish (and admin Partners)
- `/partner` → dashboard or login (was a 404: `before-partner-root-*.png`); signed-in
  `/partner/login` → dashboard (was the form: `before-partner-login-signed-in-*.png`).
- Copy: `src/components/partner/copy.ts` uses the Clipboard API and falls back to select + copy; if
  both fail the page says so and the link is in a selectable field.

### Code generator
`codeFromName` drops `(...)` (also unclosed) and everything after `/`, and stops at a word boundary
within 24 chars: "Carmen Travels (Carmen Travel and Tours)" → `carmen-travels`,
"Ama Tours / Elmina Beach Branch" → `ama-tours`. Existing codes are not changed.

## Issues found on the pages, and what changed

| Page | Issue (before) | Change (after) |
|---|---|---|
| All partner pages | Browser tab said "Abeiku — WhatsApp Hotel Booking for Ghana" | Titles: "Sign in · Abeiku Partner Portal", "Set your password · …", "Your referrals · …"; admin "Partners · Abeiku Admin" |
| Partner login | Wrong password showed "Invalid credentials"; network failure "Something went wrong" | "That email or WhatsApp number and password don't match. Check both and try again." / "Couldn't reach Abeiku. Check your internet connection and try again." in a styled alert |
| Partner login | No way forward when the password is forgotten | "Ask your hotel for a new setup link" note |
| Partner login/setup | Input borders gray-300 (1.5:1), placeholder and subtitle grey | Borders gray-500 (≈4.8:1), labels gray-800, subtitle gray-300 on navy |
| Setup, missing token | Form shown; failed only on submit with "Missing setup token" | Explains the full link is needed, button to sign in |
| Setup, expired/used token | Form shown; failed on submit with "Invite link has expired" | Checked on load: "Link expired — Ask your hotel to send you a new one." |
| Setup, valid | Generic | Greets the partner by name; reset links say the old password stops working |
| Dashboard | "Loading…" text then layout jump | Skeleton with the same layout |
| Dashboard | Load failure: red "Failed to load your bookings", no way to retry; 401 not handled | Card with plain message and "Try again"; 401 goes to login |
| Dashboard | Hints and empty state `text-gray-400` (2.6:1) | gray-600/700 (≥ 7:1) |
| Dashboard | 5-column table squeezed on a 375px phone; status meaning only in a hover tooltip | Card list on phones, table from 640px; status legend under the list |
| Dashboard | Copy button failed silently without the Clipboard API | Fallback + message; "Copied ✓" feedback |
| Dashboard | Money "GH₵420.00" | "GH₵ 420.00"; "Owed to you" first and highlighted |
| Partner header | Logout was faint grey text, small tap target | Outlined button, 44px tall |
| Admin shell | Sidebar 256px wide on a phone left ~120px for content (`before-admin-partners-375.png`) | Phone: top bar with Menu button (`after-admin-nav-open-375.png`); active page marked in the nav |
| Admin Partners | `alert()` for errors; refresh failures ignored | Inline dismissable error banner; payout errors shown next to the form |
| Admin Partners | Empty states `text-gray-400` "Nothing here." | Headline + explanation per filter ("Nothing owed right now — a booking becomes owed once the guest has checked out") |
| Admin Partners | Filter chips without counts, grey border | "Owed (1) / All (3) / Unknown codes (1)", `aria-pressed`, AA borders |
| Admin Partners | Setup link notice: fixed "valid 14 days", ✕ without label, overflow on phones | Real expiry date, link in a selectable field, Copy with feedback, labelled Close, stacks on phones |
| Admin Partners | Active partners: no action | "Reset password" (item 7) |
| Admin Partners | "1 nights", "? nights" | "1 night" / "—" |
| Admin Partners | Link preview hard-coded "aracuya.com/?ref=" | Uses the hotel's site, or says there is none |
| Admin Partners | "undo" in gray-400; "Save" unclear | "Undo" in brand green with confirm text; "Save payout", date can't be in the future |
| Admin Partners | 8-column table on phones | Card lists for partners and bookings below 768px |

Not found anywhere in the screens (checked by the script on every shot's text): `undefined`, `NaN`,
`null`, raw JSON, `Error:`; no JS page errors. `formatMoney` and `formatDate` now return "—" for
missing or invalid values instead of `NaN`/`Invalid Date`.

### Contrast (WCAG AA)
axe-core 4 (`scripts/axe.mjs`, tags wcag2a/2aa/21aa) on partner login (with error), setup
(valid/expired/missing), dashboard (bookings/empty), admin Partners (all filters) and the create form,
at 375px and 1280px: **0 violations**. Control: the same run on the unchanged `/admin/payments` reports
5 `color-contrast` failures (`text-gray-400`, 2.6:1), so the check does catch them.
Input/button borders (non-text contrast, not covered by axe): gray-500 on white ≈ 4.8:1.

### Favicon
Present (`/favicon.ico`, 200), but it is the default Create Next App icon. I did not replace it,
because a new icon changes every page of abeiku.com and needs a brand asset (decision 2).

## Screenshots
`before-*.png` were taken on origin/main code, `after-*.png` on this branch, both at 375 and 1280px,
on a local dev server with production data (read-only) or mocked API responses:
login, login-wrong-password, login-network-error, login-signed-in, root (`/partner`),
setup-valid, setup-expired, setup-missing-token, dashboard (mocked bookings), dashboard-empty,
dashboard-load-error, logout, admin-partners (real list), create-form, setup-link (mocked response),
mock-list, filter-all, filter-unknown, mark-paid-form, marked-paid (all mocked), admin-logout;
`after-admin-nav-open-*` is new (no "before": there was no menu).
The app pages are fixed full-screen panels, so a "full page" shot shows one screen height; long lists
continue below. The before shots show the Next.js dev badge (bottom left); it is hidden in the after shots.
Scripts: `scripts/` (they read `.env.local` at run time; no secrets in the files).

## Shared code changed (outside the partner pages)
- `src/middleware.ts`, `src/lib/admin/auth.ts`: session type check (all admin pages/APIs).
- `src/app/admin/layout.tsx` + new `AdminNav.tsx`: every admin page gets the phone menu, the active
  link and the working logout. Desktop sidebar looks the same as before.
- `src/app/admin/login/layout.tsx`: page title only.
- `src/app/api/admin/hotel/route.ts`, `src/app/admin/settings/page.tsx`, `settings/notifications/page.tsx`,
  `SettingsForm.tsx`, `NotificationSettings.tsx`: get `hotelView` instead of the raw row (same fields used).
- `src/lib/partner/bulk.ts`: `ref_link` may be `null` for hotels without a partner site.
- `src/lib/db/influencers.ts`: new `setInfluencerResetInvite`.

## Decisions I made (small, reversible)
1. Item 6 uses an env map (`PARTNER_SITE_URLS`) rather than a new `hotels` column, so no database
   migration is needed. Other hotels get **no** link (not a widget link) because the widget does not
   record `?ref=`. If you want it on the hotel record instead, it is one function to change.
2. Favicon left as is (see above).
3. Reset links last 3 days (first invites stay 14).
4. Old sessions without `typ` are accepted by shape, so nobody is logged out by the deploy.
5. Generated ref codes are capped at 24 characters at a word boundary (typed codes may still be 40).

## For Harrison / Maddie
- When a second hotel gets partners: set `PARTNER_SITE_URLS` on Netlify, e.g.
  `{"other-hotel":"https://other-hotel.com"}`, and that site must report bookings with the ref code.
- Not done here (outside group A items 1-7, 9): the other admin pages still use `text-gray-400`
  (axe shows it on `/admin/payments`), emoji nav icons render as boxes on systems without an emoji
  font (seen in headless Chrome), login rate limits, the WhatsApp webhook signature.
