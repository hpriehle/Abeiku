# Booking sources

Abeiku keeps **every** booking of a hotel in the `bookings` table, wherever it was made.
Each row says where it came from (`source`) and its id there (`external_ref`); the pair is
unique per hotel, so writing the same booking again updates the row it already has.

| `source` | Where it comes from | `external_ref` | How it arrives |
|---|---|---|---|
| `NULL` | Made in Abeiku before sources existed (WhatsApp bot, admin) | `NULL` | unchanged |
| `aracuya_web` | aracuya.com bookings (card via Stripe, or MoMo) | the site's booking ref, e.g. `ARC-1A2B3C4D` | booking report (card) and calendar sync (card and MoMo) |
| `google_calendar` | Entries staff make by hand on Aracuya's Google booking calendar | Google event id | calendar sync |
| `airbnb`, `vrbo`, `booking_com` | OTA bookings and blocks from their iCal export links | iCal `UID` | calendar sync |
| `manual`, `whatsapp` | Reserved for bookings made in Abeiku | | not written yet |

Imported bookings (everything except `NULL`, `manual`, `whatsapp`) **never get automatic
WhatsApp messages**: the lifecycle job (check-in/checkout reminders, review requests, return
offers, photo invites) only picks bookings with source `NULL`, `whatsapp` or `manual`.

Aracuya is one listing, room slug `suite`, of 3 identical rooms booked by count:
`rooms_count` is 1, 2 or 3 (3 = Entire House).

## 1. Website booking report

`POST /api/public/referral/aracuya/booking`, `Authorization: Bearer $ABEIKU_REFERRAL_SECRET`.
Body: see Aracuya PR #10 (`event`, `booking_ref`, `ref_code` or `null`, dates, prices,
`guest_name`, `guest_email`, `guest_phone`, `room {id, name}`, `rooms_count`, `guests`).

- `paid`: upserts the `aracuya_web` row (idempotent on hotel + booking ref + event). With a
  `ref_code`, also the partner row in `referral_bookings` with its commission, exactly as before
  (see [partner-tracking.md](partner-tracking.md)). Without one, no partner row.
- `cancelled` / `refunded`: the bookings row becomes `cancelled` (and `refunded` sets
  `payment_status = refunded`); the partner row, if any, gets the status and loses its commission
  unless already paid out.
- `ref_code: ""` is still a 400 (send `null` when there is none).

## 2. Calendar sync (every 15 minutes)

`netlify/functions/booking-sync.mts` is a Netlify scheduled function (`*/15 * * * *`). It calls
`POST /api/cron/booking-sync` with `Bearer $CRON_SECRET`; that route reads Aracuya's feeds
(read-only) and updates `bookings`. It returns counts only (inserted, updated, cancelled,
unchanged, matched web bookings, failed feeds), never guest data. To run it by hand:

```sh
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<site>/api/cron/booking-sync
```

Rules (code: `src/lib/bookings/calendar-sync.ts`, tests next to it):

- **Google Calendar**: events from a month ago to three years ahead. Skips events whose summary
  starts with `HOLD` (unpaid website holds). Rooms: the private extended property `rooms=<n>`,
  else the summary (`1 Room`, `2 Rooms`, `Entire House` = 3), else the whole house (3). A timed
  00:00–00:00 entry is one night; a short slot (cleaning) is no night and is skipped.
- **Website bookings on the calendar** are not counted twice. Events the site created carry
  `bookingId` in their private properties and are stored under `aracuya_web` + that id, the same
  row as the website report. Events with an `Aracuya · <rooms> · <guest> (paid …)` summary but
  no properties are matched to the `aracuya_web` row with the same dates and guest name (then
  remembered by event id). MoMo bookings are only on the calendar, so they come in this way.
- **iCal feeds** (Airbnb, VRBO, Booking.com; the source is told from the link's host): every
  event is the whole house (3 rooms). VRBO's `Reserved - <name>` gives the guest name;
  other blocks are named after the OTA and the summary (e.g. `Airbnb · Reserved`). Phone and
  price are unknown (`phone` NULL, `total_price` 0).
- **Gone from a feed → `cancelled`**, never deleted, and only for stays not yet over (feeds drop
  past events). A feed that fails to load cancels nothing that run. A website booking is only
  cancelled this way once the sync has linked it to a calendar event. A cancelled calendar or OTA
  booking that comes back becomes `confirmed` again.

## Environment variables

| Variable | Used by | Notes |
|---|---|---|
| `ABEIKU_REFERRAL_SECRET` | booking report | already set (same value as on aracuya.com) |
| `CRON_SECRET` | `/api/cron/booking-sync`, the scheduled function | already set; the sync route refuses all calls when it is empty |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | sync | same names and values as on aracuya.com |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | sync | PEM; literal `\n` is fine |
| `GOOGLE_BOOKING_CALENDAR_ID` | sync | Aracuya's booking calendar (shared with the service account) |
| `BLOCKING_ICAL_URLS` | sync | comma-separated Airbnb, VRBO, Booking.com export links (private: only hosts are logged) |
| `URL` / `BOOKING_SYNC_URL` | scheduled function | Netlify sets `URL`; `BOOKING_SYNC_URL` overrides the site address |

The sync reads with the `calendar.readonly` scope; it never writes to the calendar or the feeds.

## Running the migration

Order: **migration first, then deploy.** The new code reads and writes the new columns.

1. Supabase dashboard → SQL editor → paste all of `supabase-migration-booking-sources.sql` → Run.
   It is one transaction, additive only (new nullable columns `source`, `external_ref`,
   `guest_email`, `guests`, `ref_code`, `paid_at`; a check on `source`; unique
   `(hotel_id, source, external_ref)`; an index; `phone` becomes nullable). Running it twice is fine.
2. Check with the read-only query at the end of the file.
3. Then (separately) `scripts/aracuya-reset.sql` resets Aracuya's test data and rooms.
4. Set the four sync env vars on the Abeiku Netlify site, deploy, and watch the first
   `booking-sync` run in the Netlify function log.
