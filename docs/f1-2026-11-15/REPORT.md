# F1: hotel-admin shell, phone layout, icons, contrast (2026-11-15)

Branch `chat/abeiku-f1-resume`. Most of the code changes came from the first worker's WIP commit 87bf89d. I reviewed it, kept it all and added the after-run, the scripts and this report. Nothing is deployed, pushed or merged.

## Result in numbers (axe-core WCAG 2 A/AA plus an overflow check, 25 admin views × 375 and 1280 = 50 runs)

| | before (main @ 6108254) | after |
|---|---|---|
| color-contrast nodes | **254** | **0** |
| button-name (icon/emoji buttons without a name) | 68 | 0 |
| label / select-name (unlabelled inputs) | 24 / 8 | 0 / 0 |
| scrollable-region-focusable | 7 | 1 (see "Not done") |
| views wider than the screen (horizontal scroll) | 6 (dashboard +63px, bookings +79px, settings +88px at 375; settings +49px at 1280) | 0 |

Raw data: `before-results.json`, `after-results.json`. Screenshots: `before-admin-<page>-<375|1280>.png` and `after-admin-<page>-<375|1280>.png` for login, root (redirects to onboarding), dashboard, nav-open, bookings, bookings-detail, rooms, rooms-form, inbox, inbox-thread, templates, report, reviews, payments, partners, settings, settings-whatsapp, settings-google, settings-google-reviews, settings-momo, settings-paystack, settings-notifications, simulator, onboarding, platform.

## Issue → change

| Issue (audit item 10 / B1) | Change |
|---|---|
| Phone menu only half-done; content squeezed | `src/app/admin/AdminNav.tsx`: phone gets a sticky top bar with a Menu button that opens a drawer (backdrop, Esc, the X and any link close it; `aria-expanded`, `aria-current`). Desktop sidebar can collapse to icons only (saved in localStorage). `<main>` takes the full width at 375. |
| Emoji icons render as empty boxes | `lucide-react` added (package.json). Menu, dashboard stat cards, payments stat cards, onboarding steps and the templates header use SVG icons (`aria-hidden`); emoji/HTML-entity icons removed. |
| Light grey text below AA (text-gray-400/#999, placeholders, disabled states) | Every light-grey-on-light use in `src/` moved to gray-500/600 or darker (remaining `text-gray-300` is on the dark navy sidebar/headers only). Status colours darkened (yellow-600 → amber-700, green-600 → green-700). Disabled buttons use gray-600 on gray-200 instead of opacity. Input borders #868e9c (3.3:1). |
| Wide tables push the page sideways | Bookings: one card per booking on phone, table from md up. Dashboard calendar and room grid, payments table: scroll inside their own box. Settings notification matrix rebuilt as a 3-column grid with labelled switches (`role="switch"`, `aria-checked`). Communication tabs, toolbars and filter rows wrap. |
| Inconsistent buttons, inputs, headings, spacing | One small set of shared classes in `src/app/globals.css` (`@layer components`): `admin-page`, `admin-page-narrow`, `admin-h1`, `admin-subtitle`, `admin-h2`, `admin-card`, `admin-label`, `admin-hint`, `admin-input`, `admin-btn-primary/-secondary/-danger/-ghost`, `admin-table-wrap`. Applied across dashboard, bookings, rooms, communication, reviews, payments, settings and sub-pages, platform, simulator, onboarding, login, Partners. Brand colours (#1a1a2e, #2D4A3E) and the heading font are unchanged. |
| Unlabelled inputs and icon buttons | 30 `htmlFor`/`id` pairs added. `aria-label` on icon-only buttons (month arrows, close, back to conversations, search). |

## Files changed outside src/app/admin (all styling-only, in scope of "light grey across src/")

| File | Change |
|---|---|
| `src/app/globals.css` | Adds the `admin-*` classes above. They are new class names, so nothing else changes. |
| `package.json`, `package-lock.json` | Adds `lucide-react`. |
| `src/app/page.tsx` | Two text colours gray-400 → gray-500 (waitlist note, footer). No layout or content change; the landing page redesign stays in step L1. |
| `src/app/signup/page.tsx` | Subtitle gray-400 → gray-300 (on a dark background), placeholders and footer text gray-400 → gray-500. |
| `src/app/booking/dates/page.tsx` | "Pick check-in" hint gray-400 → gray-500. |
| `src/app/booking/payment-callback/page.tsx` | Subtext #999 → #6b7280. Colour only; no payment logic touched. |
| `src/components/BookingCalendar.tsx` (public widget) | Weekday labels gray-400 → gray-500. Past days gray-300 → gray-500 with a line-through, so they still look unavailable. Same behaviour. |
| `src/components/PhoneChat.tsx` (landing demo) | Timestamps, weekday labels and "Type a message" gray-400 → gray-500. |
| `src/components/WaitlistForm.tsx` | Placeholder gray-400 → gray-500. |

In WhatsApp, Paystack, MoMo, payments and Partners I checked the WIP diff line by line. The only changes are classes, label/`id` pairs, `aria-*` attributes, status text colours and the payments stat-card icons. No handler, fetch or state logic changed.

## Evidence

- `npm test`: 10 files, 80 tests passed.
- `npm run build`: passed.
- `npm run lint`: 32 problems (8 errors, 24 warnings), the **same set as main @ 6108254**. I compared both with eslint; the only difference is one existing InboxTab error that moved from line 82 to 83. No new problems.
- `docs/f1-2026-11-15/scripts/shots.mjs after .env.local docs/f1-2026-11-15`: `pages=50 failed=0 color-contrast nodes=0`.
- Spot-checked these screenshots by eye: dashboard, bookings detail, inbox thread, phone menu open, settings, add-room form and Partners at 375, plus bookings detail at 1280.

## How the screenshots were made (read-only)

- Local `next dev` with `.env.local` copied in (gitignored, not committed). It points at production Supabase.
- `scripts/lookup.mjs` reads hotel and admin-user ids (select only). `scripts/sign.mjs` signs a 1-hour admin session for **Test Hotel** with `role: platform_admin`, so the Platform page renders too.
- `scripts/shots.mjs` blocks every non-GET request in the browser (API calls and server actions), so nothing is saved. Before saving each screenshot it runs axe and the overflow check. `ONLY=<regex>` re-runs some pages and merges them into the results file. Playwright comes from `PW=<path>` because the repo has no playwright dependency.
- The before set was taken by the first worker against the pre-change code; I didn't regenerate it.

## Not done / notes

- `payments-375` has one axe `scrollable-region-focusable` hit: `<main>` scrolls but Test Hotel's payments page has no focusable element in it. It is not a contrast issue and was on 7 views before. Fixing it means making `<main>` focusable (`tabIndex=0`), which adds a tab stop on every page. I left it.
- The Paystack settings page logs React "duplicate key" warnings in dev: Paystack's bank list repeats some bank codes (`key={bank.code}`). This is already on main, and Paystack code is off-limits for this step. It's a one-line fix (`key={bank.code + i}`) for a later step.
- The "Dev: Run Onboarding" button on Settings is still shown, as before.
