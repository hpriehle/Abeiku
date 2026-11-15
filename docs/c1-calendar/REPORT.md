# C1 UI: one calendar for every Aracuya booking (2026-11-15)

Branch `chat/abeiku-c1-calendar`, based on `chat/abeiku-f2-reliability`. Nothing is deployed, pushed or merged. No production data was written. The browser checks used **mock bookings only** (made-up guests). Every non-GET request was blocked during the checks, and none was attempted.

## Result

| Check | Result |
|---|---|
| `npm test` | **22 files, 169 tests, all pass** (F2 had 147; there are 22 new tests) |
| `npm run lint` | **0 errors**, 23 warnings (all older than C1; F2 listed 24) |
| `npm run build` | **passes**; it includes `/admin/calendar` and `/api/admin/calendar` |
| Browser checks (`scripts/verify.mjs`) | **22/22 pass**: 11 checks at 375 px and 1280 px, axe WCAG 2.1 AA with 0 violations, no horizontal page overflow, no JS errors, 0 write requests (`verify-results.json`) |

## What Harrison sees

- **Calendar** is a new item in the admin menu, between Dashboard and Bookings (`/admin/calendar`). The same board is now the main block on the **Dashboard**, under the stat cards, with an "Open full calendar" link. It replaces the old month calendar and room grid there. Those two components are still in the repo but nothing uses them.
- **14 days** (the default): one lane per room (Room 1–3). A 2-room stay takes two lanes. A "Booked" row shows `2/3` for each night, as a small meter plus text. If a night has more rooms booked than exist, a red "Overbooked" lane appears. Each bar shows the guest, the source, the nights and the rooms. Bars are tinted with the source colour and have a colour stripe.
- **Month**: each day shows rooms booked out of 3. On wider screens it also shows the first names staying that night. Tapping a day lists that day's stays (arrives / staying / leaves). On a phone this list is how you see the guests.
- **Source badges and colours**: Website, MoMo, Google calendar, Airbnb, VRBO, Booking.com, WhatsApp, Manual. The 8 colours come from a palette I checked with a colour-blindness validator (all checks pass). The source is always written out in text as well, so colour is never the only cue. A legend sits above the view.
- **Show cancelled**: off by default. When on, cancelled stays appear in their own dashed "Cancelled" lane, struck through.
- **Arrivals / Departures**: grouped into Today, Tomorrow and This week (the next 7 days). Cancelled stays are left out.
- **Booking drawer**: tapping any booking opens it. It is a side panel on a computer and a bottom sheet on a phone. It shows the guest, source, dates, nights, rooms, guests, amount with currency and paid status, partner code, reference, when it came in, when it was paid, email (mailto) and phone (Call and WhatsApp buttons).
  - Imported sources show "Read-only: … Edit this in <the aracuya.com bookings admin / the Google booking calendar / Airbnb / VRBO / Booking.com>".
  - OTA bookings with no price say "Not known (Airbnb doesn't share it)" instead of 0.
  - WhatsApp and manual bookings get a "Check in, change dates or payment" button. It opens the existing booking modal with its existing actions.
  - Escape and the backdrop close the drawer. Focus stays inside it while it is open and goes back to the booking you tapped when it closes.
- **States**: "Loading bookings…" while loading. An error message with "Try again" if loading fails. "No bookings in these two weeks / this month" when there are none.

## How it works

- `src/lib/bookings/calendar-view.ts` holds pure functions, tested in `calendar-view.test.ts` (16 tests):
  - `sourceOf()` maps a row to its badge. `aracuya_web` paid with MoMo → MoMo, otherwise Website. `NULL` → WhatsApp (these rows are from before sources existed). Each badge knows whether it is imported and where to edit it.
  - `groupStays()` joins back-to-back **one-night** rows into one stay when they have the same guest (case and spaces ignored), the same source, the same rooms count and the same cancelled state. Multi-night rows are never joined. **This is display only: the rows are not changed (tested).**
  - `assignLanes()`, `roomsBookedOn()` and `movements()` build the lanes, the nightly occupancy and the arrival/departure lists.
- `GET /api/admin/calendar?from&to` is **read-only**. It needs the admin session and accepts at most 200 days. It returns only the fields the calendar shows, plus `totalRooms` (3 for Aracuya, from `HOTEL_LISTINGS`) and the room names. It uses `select("*")`, so it works **before and after** the booking-sources migration; columns that don't exist yet come back as null. The query is `getCalendarBookings()` in `src/lib/db/index.ts`.
- The page asks for a month extra on each side of the visible window, so a stay that starts before the window is still grouped correctly. "Today" is the date on Harrison's device.
- **New guard** in `PUT /api/admin/bookings/[id]`: imported bookings (website, Google calendar, Airbnb, VRBO, Booking.com) get a 409 with "Change it in …". Before this, the existing Bookings page could cancel or change one. The next sync would have undone the change, and the change could have sent the guest a WhatsApp message. Tested in `route.test.ts` (6 tests): for each imported source, nothing is updated and nothing is sent; WhatsApp bookings still work. Sync, ingest and partner code are unchanged.

## Screenshots (mock data)

All at 375 and 1280 px:
- `calendar-timeline`, `calendar-month`, `calendar-cancelled-shown`, `dashboard`, `arrivals`
- `drawer-website` (read-only, with partner code), `drawer-whatsapp` (edit button, WhatsApp link), `drawer-grouped` (three Google one-night entries shown as one 3-night stay)
- `state-loading`, `state-empty`, `state-error`

The stat cards at the top of `dashboard-*` are real aggregate counts from the production DB (read-only, no guest data). The calendar in those screenshots uses mock data.

To re-run: start `next dev -p 3031` with the env loaded, run `node docs/f1-2026-11-15/scripts/lookup.mjs <env> /tmp/ids.json` (read-only, ids only), then `PW=<playwright> node docs/c1-calendar/scripts/verify.mjs <env> /tmp/ids.json docs/c1-calendar`.

## Small choices I made (easy to change)

- The dashboard shows the new calendar in place of the old month calendar and room grid. The old grid also showed "external" Google busy dates live from the calendar. Those now come in as rows through the sync, once the migration is applied.
- Rows with `source` NULL show as **WhatsApp** and can be edited.
- MoMo is told apart from Website by `payment_provider = 'momo'` on `aracuya_web` rows.
- Lanes are filled first-free, so a 2-room stay can sit in Room 1 and Room 3. The rooms are identical, so the lane number is not a real room number.
- For a grouped WhatsApp/manual stay, the edit button opens the first night's row. In practice, grouping only happens for Google one-night entries, and those are read-only.

## Not done / for Harrison

- Nothing is deployed. Until `supabase-migration-booking-sources.sql` is applied and the sync runs, production has only the old Abeiku rows. The calendar will show those (as WhatsApp) and no website, Google or OTA bookings.
- I did not test against real imported rows, because the production DB doesn't have the columns yet.
