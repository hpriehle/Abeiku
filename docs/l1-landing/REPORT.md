# L1: landing page for Ghana hotels

Branch `chat/abeiku-l1-landing` (from `chat/abeiku-c2-alerts`, 573fb3a). Not deployed.

## What changed

- `src/app/page.tsx`: the home page is now a landing page that sells Abeiku to small hotels and
  guesthouses in Ghana. Sections: hero, what you get, how it works, pricing, questions, footer.
  F1 admin look: navy `#1a1a2e` bars, admin green `#2D4A3E` buttons, gray-700/900 text on white,
  no light grey on grey. Mobile first. Title, description and Open Graph tags for Ghana hotels.
- The WhatsApp booking bot is gone from `/`: no phone chat demo, no waitlist, no "book on
  WhatsApp". `PhoneChat` and `WaitlistForm` components are no longer used by any page but are
  left in `src/components/` (not deleted).
- `src/app/signup/page.tsx`: the old form (created a hotel and admin login at once, no trial, no
  card, subtitle "Set up your WhatsApp booking assistant") is replaced by a placeholder: "Sign-up
  opens soon" with hello@abeiku.com. Chosen with Maddie (option C).
- `src/app/layout.tsx`: default site title/description no longer say "WhatsApp Hotel Booking".
- `src/lib/site.ts`: contact email, trial days and prices in one place.
- All page text: `COPY.md`.

## Evidence

- `npm test`: 25 files, 204 tests passed.
- `npm run lint`: 0 errors (23 warnings, all in files this change does not touch).
- `npm run build`: passes; `/` and `/signup` are static. (One earlier build failed fetching Google
  Fonts for `next/font/google`, a network flake; the rerun passed with no code change.)
- `next start -p 3041`, curl: `/` 200, `/signup` 200, `/admin/login` 200, `/partner/login` 200,
  `/api/signup` 405 on GET (route still there). `/widget/aracuya` 500 locally only because no
  Supabase env was loaded (`Missing SUPABASE_URL`); widget code untouched.
- `scripts/shots.mjs` (Playwright): screenshots at 375 and 1280 of `/` and `/signup`; at every
  size: no sideways scroll, no em dash in the page text, no "book on WhatsApp"/"WhatsApp booking"/
  "WhatsApp bot" text. Results in `shots-results.json`.

## Not done / for L2

- `/api/signup` still works if called directly (creates a hotel + admin with no trial or card).
  L2 must gate or replace it.
- The page promises a 30-day trial with a card, Paystack in cedis, card in USD, cancel any time.
  None of that billing exists yet (L2).
- "Connect your calendars": calendar sync today reads Aracuya's feeds set up by us. There is no
  self-serve screen yet for a new hotel to paste its Airbnb/Booking.com/VRBO/Google links.
- hello@abeiku.com: Maddie will confirm the mailbox exists before deploy.

## For Harrison to decide

- Approve the text in `COPY.md`.
- Small choices made here (easy to change): "Used by Aracuya, a guesthouse in Busua" in the hero;
  hero line "Every booking for your hotel, in one calendar."; a fourth FAQ ("Do I have to stop
  using Airbnb or Booking.com?"); a "Partner log in" link in the footer; price shown as "a month"
  with dollars as "or $25 a month".
