# L2 feeds: every hotel's own calendars are synced, and editable on Settings > Calendars

Branch `chat/abeiku-l2-feeds` (from `chat/abeiku-l2-signup`, f8eab12). Not deployed, not pushed.
No database writes, no real feed URLs fetched (all fetches are mocked in tests; the screenshots
mock the API in the browser), no email sent.

## Result

| Check | Result |
|---|---|
| `npm test` | **34 files, 315 tests, all pass** (L2 had 281; 34 new) |
| `npm run lint` | **0 errors**, 24 warnings (same as L2; none in new files) |
| `npx tsc --noEmit` | clean |
| `npm run build` | passes; includes `/admin/settings/calendars`, `/api/admin/calendar-feeds`, `/api/admin/calendar-feeds/[id]` |
| Screenshots 375 px | 4 shots, no sideways scroll, no em dash, 0 write requests (`shots-results.json`) |

## What a hotel sees

**Settings** has a new **Calendars** tile ("2 connected" / "Not connected"; Aracuya: "Set up by Abeiku").
**Settings > Calendars** (`calendars-375.png`):
- One card per link: the site (Airbnb, Booking.com, VRBO, Google calendar), the room it blocks or
  "Whole property", the link shortened to its host (iCal links hold private tokens), and a status line:
  - green "Last synced 15 Nov, 12:13: 4 bookings found",
  - red "Last error 15 Nov, 12:14: This calendar link no longer works. Copy a fresh link from the booking site." (shown while the error is newer than the last good sync),
  - "Not synced yet. The first check runs within 15 minutes."
- **Change**: paste a new link (or leave it empty) and/or pick another room (`calendars-edit-375.png`).
- **Remove**: asks first. Its upcoming stays leave the calendar (marked cancelled, no email); past stays stay as history.
- **Add a calendar**: "Booking site link" (Airbnb / Booking.com / VRBO, detected from the link) or "Google calendar", plus "Which room does it block?" (Whole property or one of the hotel's rooms).
  The button says "Checking the link..." while it reads the link once. Errors show right above the button (`calendars-add-error-375.png`).
- Google (`calendars-google-375.png`), one line: *First, in Google Calendar open the calendar's settings, choose "Share with specific people" and add `<service account email>` with "See all event details". The ID is under "Integrate calendar".*
  This is the same mechanism C1 uses for Aracuya: the service account `GOOGLE_SERVICE_ACCOUNT_EMAIL` reads the calendar. The email shown is that env var.
- **Aracuya** sees "Abeiku looks after your calendars" with its sites listed, read-only (its feeds stay in env).

## How it works

- **New table `hotel_calendar_feeds`** (`docs/l2-feeds/calendar-feeds.sql`): hotel, kind, url (iCal link or Google calendar ID), `room_slug` (NULL = whole property), `last_synced_at`, `last_count`, `last_error`, `last_error_at`. Plus `bookings.feed_id` (which feed a row came from). L2's `hotels.calendar_links` JSON didn't fit (no room, no status, one link per site), so it stays as sign-up's record and is copied in:
  - by the SQL, for hotels that signed up before it runs;
  - by `/api/signup/calendars` afterwards (best effort, after the existing save; the step's previous links that were dropped are removed, links added on the Calendars screen are left alone). The sign-up flow itself is unchanged.
- **Cron** (`/api/cron/booking-sync`, same Netlify function, same 15 min): Aracuya's env sync runs **exactly as before** (same `readFeeds`, same `syncHotelBookings` call, same alert call when no other hotel synced, same response fields). Next to it, at the same time, `syncFeedHotels` (`src/lib/bookings/feed-sync.ts`) does every other hotel. The response gains `otherHotels` (counts only, no links).
- **Who is synced:** hotels on a trial, paid, past due, cancelled-but-still-inside-the-paid-time, or billing-exempt. Not: no card yet, ended, hotels outside billing, inactive. Aracuya is always excluded here (env).
- **Limits so one bad feed can't stall the rest:** each iCal read has an 8 s timeout and a 3 MB cap; Google 8 s; at most 6 feeds read at once; at most 60 feeds per run, oldest-synced first; no new feed started after 9 s and no hotel saved after 18 s (the Netlify function waits 25 s). A feed that fails gets a plain-English error on its row; its bookings are left as they are (nothing cancelled). Feeds not reached keep their old `last_synced_at`, so they go first next run.
- **Rooms:** a feed tied to a room blocks 1 unit of that room (`room_slug` = the room). Whole property blocks all units (sum of the hotel's rooms; if none set up yet, the sign-up room count). Google events keep C1's "2 Rooms" / "Entire House" parsing within that limit. A room that was deleted later counts as whole property ("Room removed, counts as whole property").
- **Cancellations** are judged per feed (`feed_id`), not per site, so a hotel with two Airbnb listings works: one listing failing cancels nothing, the other still cancels its own removed stays. Aracuya's rows have no `feed_id` and keep the old per-site rule.
- **Alerts (C2 rule holds):** each per-hotel feed is its own key in `booking_alert_feeds` (`feed:<id>`), so the first good sync of *any* new feed, including a second Airbnb listing added months later, sends no emails; later new bookings and removals alert. A feed whose first try fails stays "never synced", so its first good load is still silent. Several hotels: each one's backfill is marked, then one sweep; a hotel whose backfill couldn't be marked is left out of that sweep only.
- **Validation on save** (`validateFeedInput`): https (webcal accepted), Airbnb / Booking.com / VRBO host, not a duplicate, room exists, then one read (6 s): not found, refused, web page instead of calendar, too big, too slow, redirect to another site each give their own sentence. Google: ID shape, then a one-event read with the service account; 403/404 says to share it first.
- **Before the SQL runs nothing breaks:** cron logs "hotel feeds not available" and syncs Aracuya as now; the Calendars screen says "Calendar links can't be changed yet"; add/change returns 503 with that sentence (never 500); sign-up still saves `calendar_links`.

## Tests (mocked fetch, in-memory stores)

`src/lib/bookings/feed-sync.test.ts` (26), `src/app/api/cron/booking-sync/route.test.ts` (4), `src/app/api/admin/calendar-feeds/route.test.ts` (4):
- multi-hotel: two hotels synced into their own rows with feed id, room, rooms count, statuses recorded; a pending-card hotel and Aracuya never fetched;
- isolation: timeout, 404, 500, oversized file, HTML page, unreachable host, non-OTA host each fail alone with their message, no token in any error, the good feed syncs, the run finishes in well under 2 s; failing feed cancels nothing while the same site's other feed cancels its removed stay; per-run cap and deadlines; concurrency limit;
- first sync silent: first run 0 emails, re-sync 0, new booking 1 (to the right hotel), second listing added later 0, removal 1 cancellation; first-try-fails then silent;
- Aracuya unchanged: env-style feeds give the same rows as before (`suite`, no `feed_id`, per-site cancel); the route calls the env sync with 3 rooms and the old alert path, response fields kept, a crash in other hotels doesn't fail Aracuya, feeds table missing changes nothing;
- validation: 7 refusals without fetching, friendly fetch errors, duplicate vs editing, redirect off-site, Google shared / not shared / not configured; admin API: no full link in the list, 503 before SQL, Aracuya 409.

## Screenshots (mock data, made-up hotel "Palm Lodge (test)")

`calendars-375.png`, `calendars-google-375.png`, `calendars-edit-375.png`, `calendars-add-error-375.png`.
To re-run: `npm run build`, `JWT_SECRET=x npx next start -p 3047` (no database env), then
`JWT_SECRET=x PW=<path>/node_modules/playwright node docs/l2-feeds/scripts/shots.mjs`.

## SQL for Harrison (run by hand in Supabase)

`docs/l2-feeds/calendar-feeds.sql`: idempotent, one transaction, additive. Run after
`supabase-migration-booking-sources.sql` and `docs/l2-signup/billing.sql`. Check queries at the bottom.

## Small choices I made (easy to change)

- Aracuya stays env-only and read-only on the Calendars screen (adding its links in the DB too would import its bookings twice).
- Only Airbnb, Booking.com and VRBO iCal links are accepted (other hosts are refused, which also keeps the server from fetching arbitrary URLs). Other channel managers would need a new source type.
- Removing a link cancels its upcoming stays without an email; past stays are kept.
- Up to 20 links per hotel. Past due and cancelled-but-paid-up hotels keep syncing.
- Whole-property `room_slug` is `main` (the existing default for non-Aracuya hotels).
- The screen shows the link shortened to its host; editing means pasting a fresh link.

## Not done / for Harrison

- Not deployed; SQL not run. Nothing was tested against real Airbnb / Booking.com / VRBO / Google.
- **Decide:** new hotels get **no alert emails** today, because C2 only emails hotels with `hotels.alert_email` set and sign-up doesn't set it. The no-alert-on-first-sync rule and later alerts work (tested), but they only reach a hotel once `alert_email` is set. Setting it from the sign-up contact email would change sign-up/alerts, which this task excluded.
- The Netlify function timeout for the Next server (10 s default on some plans, 26 s max) isn't visible from the repo. The budget above assumes about 25 s, like the existing Aracuya sync. If it is 10 s, set it higher or lower `READ_MS` / `WRITE_MS` in the route.
- The admin Calendar page counts whole-property rooms as 1 when a hotel has no rooms set up, while the sync uses the sign-up room count. Only matters before a hotel adds its rooms.
- To verify live after SQL + deploy: add a test Airbnb link to a test hotel on trial; within 15 min its card shows "Last synced ... N bookings found" and the stays show on its Calendar with no email; the function log shows `"otherHotels":{"hotels":1,...}` and Aracuya's fields unchanged.
