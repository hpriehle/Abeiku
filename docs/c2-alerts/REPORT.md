# C2: booking alerts by email to Aracuya (2026-11-15)

Branch `chat/abeiku-c2-alerts`, based on `chat/abeiku-c1-calendar` (6593994). Nothing is deployed, pushed or merged. No email was sent: Resend is mocked in every test and no Resend key was used. Nothing was written to production Supabase, and nothing in this step emails guests or partners.

## Result

| Check | Result |
|---|---|
| `npm test` | **25 files, 204 tests, all pass** (C1 had 169 tests; 35 are new) |
| `npm run lint` | **0 errors**, 23 warnings (none in new code; I removed one old unused import in the lifecycle route) |
| `npm run build` | **passes**; it includes `/api/cron/arrivals-digest` |
| `npx tsc --noEmit` | clean |

## What Aracuya gets (at info@aracuya.com)

From `Abeiku <notifications@abeiku.com>`. Short, plain emails with a text version, readable on a phone. No marketing.

1. **New booking**, from any source: website (shown as Website or MoMo), Google calendar, Airbnb, VRBO, Booking.com, manual, or WhatsApp. Old rows with no source show as WhatsApp.
   Subject: `New booking: Kwame Asante, 15–18 Nov, 1 room (Google calendar)`
   ```
   New booking at Aracuya.

   Guest: Kwame Asante
   Dates: Sun 15 Nov 2026 to Wed 18 Nov 2026
   Nights: 3
   Rooms: 1 room              (3 rooms → "3 rooms (Entire House)")
   Guests: Not known
   Amount: Not known (Google calendar doesn't share it)   | website: "GHS 2,400 (paid)"
   Source: Google calendar

   Calendar: https://abeiku.com/admin/calendar
   ```
2. **Cancellation**: `Cancelled: …`, with the same fields. It covers a website cancel or refund report, a booking removed from Google or an OTA feed (as the C1 sync detects), and an admin cancel of a WhatsApp or manual booking.
3. **Arriving tomorrow**: one email a day at **18:00 Ghana time**, e.g. `Arriving tomorrow (Mon 16 Nov 2026): 2 bookings, 3 rooms (Entire House)`. It lists each arriving stay with the fields above. Cancelled stays are left out. So is a stay that started earlier and continues tomorrow. **If nobody arrives, no email is sent.**

## How it works

- **Where the alert goes:** a new column, `hotels.alert_email`. The SQL sets it to `info@aracuya.com` for hotel `75218f6b-…af21f1`. Hotels without one get no alerts.
- **Alerts run off the `bookings` table**, whatever wrote the row (`src/lib/alerts/booking-alerts.ts`, pure logic with an injected store and mailer):
  - Each row has `alert_new_sent_at` and `alert_cancel_sent_at`. Before sending, the code **claims** the row with `UPDATE … SET x = now() WHERE x IS NULL RETURNING id`, so only one run can send an alert for that row. If Resend fails, the claim is released and the next run tries again. Re-syncs, repeated reports and two runs at once all send **one** email (tested).
  - One-night Google entries of the same stay are grouped (C1's `groupStays`) into **one** email.
  - A booking that is created and then cancelled before its first alert gets no email at all.
  - If **more than 10** new stays are waiting in one run, the code sends **one summary email** ("12 new bookings at Aracuya", one line each) instead of a flood. This is a safety net.
- **When alerts are sent:**
  - **Website report** (`POST /api/public/referral/aracuya/booking`): right away, for that booking only. A failed alert never fails the report.
  - **Admin cancel** of a WhatsApp or manual booking (`PUT /api/admin/bookings/[id]`): right away.
  - **Every 15 min after the booking sync** (`/api/cron/booking-sync`): a sweep sends everything still waiting, including Google, iCal and WhatsApp bookings. The response gains an `alerts` block with counts only.
  - **Daily digest:** `netlify/functions/arrivals-digest.mts` runs at `0 18 * * *` UTC and calls `POST /api/cron/arrivals-digest`. It uses Bearer `CRON_SECRET`, the same as booking-sync, and is refused when the secret is not set. The table `booking_alert_digests` (hotel, kind, date) makes sure it is sent **once per date**. `?date=YYYY-MM-DD` lets you run it for another day.
- **No alerts for old bookings:**
  - The SQL marks every existing row as alerted, but only the first time it adds the columns. Running it again can't swallow a pending alert.
  - The C1 sync hasn't run in production yet. Its first run will import all of Aracuya's existing Google and OTA bookings. The table `booking_alert_feeds` records which feeds have synced before. On a feed's **first successful** sync, its rows are marked without sending an email. That works for Google now and for any OTA link added later. A feed that fails to load is not marked, so its first good load is still silent.
  - If the sync has already run before the SQL, the SQL marks every feed that already has rows as synced.
  - All of this is tested end-to-end with the real C1 `syncHotelBookings`: the first sync sends 0 emails, a re-sync sends 0, a new event sends 1, and removing an old booking sends 1 cancellation.
- **Deploying before the SQL is safe.** Every alert query fails on the missing column. The code logs `alert columns missing (run docs/c2-alerts/booking-alerts.sql); no alert sent` and carries on. The sync, the report endpoint and admin cancel still return their normal responses (tested).
- **No double emails for WhatsApp bookings.** The old `notifyOwner("new_booking")` email to `contact_email` is skipped for hotels that have `alert_email`. The WhatsApp code itself is unchanged.
- **Email sender** (`src/lib/notifications/email.ts`): the default `FROM` is now `notifications@abeiku.com` (it was the wrong `notifications@mail.abeiku.com`). `NOTIFICATION_FROM_EMAIL` still overrides it. A plain-text body was added.

## Lifecycle cron: scheduled, but OFF

`/api/cron/lifecycle` sends **WhatsApp messages to guests** (check-in reminders, review requests, return offers, photo invites, wake-up calls). So I added `netlify/functions/lifecycle.mts` (daily at 09:00 UTC), but it **does nothing unless `LIFECYCLE_CRON_ENABLED=true`**. The route checks the same flag, so the guard is there twice. I also fixed the route's auth: it used to run for anyone when `CRON_SECRET` was unset. Now it refuses, like booking-sync (tested). Nothing changes for guests until Harrison sets the flag. Note: wake-up calls need a more frequent run than once a day. That matters only if the flag is ever turned on.

## SQL for Harrison (run by hand in Supabase)

`docs/c2-alerts/booking-alerts.sql`. It is idempotent: `IF NOT EXISTS` throughout, one transaction, and it works before or after `supabase-migration-booking-sources.sql`. It adds `hotels.alert_email` (and sets Aracuya's), `bookings.alert_new_sent_at` and `alert_cancel_sent_at` (marking existing rows), the tables `booking_alert_feeds` and `booking_alert_digests` (RLS on), and two partial indexes. Read-only check queries are at the bottom of the file.

**Order:** run the C2 SQL **before or together with** the C1 booking-sources SQL. Deploy before or after; both are safe.

## What to verify live (after SQL + deploy)

1. `SELECT slug, alert_email FROM hotels WHERE alert_email IS NOT NULL;` → `aracuya | info@aracuya.com`.
2. Right after the SQL: `waiting_new = 0` and `waiting_cancel = 0` (check query in the SQL file).
3. Resend dashboard: `abeiku.com` is verified, so sending from `notifications@abeiku.com` works.
4. After the first booking-sync run, check the Netlify function log (`[booking-sync] 200 …`): `"alerts":{"silencedBackfill":N,"newSent":0,…}` with N about the number of imported bookings, and **no emails** in Resend. `SELECT * FROM booking_alert_feeds;` shows `google_calendar` (plus any OTA feeds).
5. Add a test event to the Google booking calendar (e.g. `1 Room - Test`, tomorrow). Within 15 min, info@aracuya.com gets one "New booking" email. The next sync sends nothing more. Delete the event: one "Cancelled" email follows.
6. A real website booking: one email when aracuya.com reports it. The calendar event for the same booking doesn't send a second one.
7. At 18:00 UTC, if anyone arrives tomorrow: one "Arriving tomorrow" email. To test without waiting: `curl -X POST -H "Authorization: Bearer $CRON_SECRET" "https://abeiku.com/api/cron/arrivals-digest?date=YYYY-MM-DD"`. Run it again and it returns `already: 1` with no second email.
8. The `lifecycle` function log shows `disabled … nothing sent`.

## Small choices I made (easy to change)

- No digest email on days with no arrivals.
- Google bookings use the event summary as the guest (C1's rule), so a subject can read `New booking: 1 Room - Kwame Asante, …`.
- The amount is what the row stores: GHS for website bookings, or USD when the site only sent USD. A USD figure next to GHS isn't on the bookings row, so it isn't shown.
- WhatsApp and manual bookings alert at the next 15-min sweep, not instantly. That avoids touching the WhatsApp code.
- No cancellation email for stays already over. A booking that is cancelled, comes back and is cancelled again only gets one cancellation email.
- The summary threshold is 10 stays per run.

## Not done / for Harrison

- Not deployed. The SQL has not been run. No real email was sent, so the first real alert will come from the live checks above.
- **Decide later:** turn on guest lifecycle messages (`LIFECYCLE_CRON_ENABLED=true`)? It is off for now.
