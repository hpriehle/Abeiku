# L2 alert email: new hotels get booking alerts without extra setup

New hotels now get booking alert emails (C2). At sign-up, `hotels.alert_email` is set to the contact
email entered on the hotel step. Admin Settings has a "Booking alerts" card where the owner can
change it or clear it. Aracuya is unchanged (`info@aracuya.com`): its sign-up is finished, so the
hotel step refuses it (409) and never writes.

No database writes, no deploy, no real email.

## What changed

- `src/lib/db/alert-email.ts`: `parseAlertEmail` (one valid address, stored lower case; empty
  clears it; commas or semicolons give "Enter one email address only."), `alertEmailOf` (what
  Settings shows) and `setHotelAlertEmail`. If the column is missing it returns `"missing"` and
  does not throw.
- `POST /api/signup/hotel`: after saving town, rooms and contact email, it also sets `alert_email`
  to the contact email. If the column is missing it logs the error and sign-up carries on.
  Doing the hotel step again (still `pending_card`) updates it to the new contact email.
- `PATCH /api/admin/hotel/alert-email` (new): saves or clears it. A bad address gets 400. If the
  column is missing the reply is 503 with "Alert emails can't be changed yet. Please try again
  later.", not 500.
- Settings: the new "Booking alerts" card (`AlertEmailForm.tsx`) sits below Hotel Information
  and has its own Save. If the column is missing the field is greyed out and says it can't be
  changed yet. The page still loads.

Alert content, billing and feeds are untouched.

## Evidence

| Command | Result |
| --- | --- |
| `npx vitest run src/lib/db/alert-email.test.ts` | 16 passed |
| `npm test` | 35 files, 331 tests passed |
| `npm run lint` | 0 errors (24 old warnings, none in new files) |
| `npm run build` | passes; includes `/api/admin/hotel/alert-email` |

The tests cover: parsing (valid, empty, bad, two addresses); the hotel step setting alert_email
to the contact email; the hotel step with the column missing (200, other details saved); Aracuya
or any finished sign-up (409, alert_email unchanged); Settings save, clear, 400, 401, and 503
when the column is missing; other DB errors still being raised.

## Screenshot

`alert-email-375.png` shows Settings at 375 px with a made-up hotel ("Palm Lodge (test)").
To re-run, start the fake read-only Supabase and the app, then shoot (steps are in
`scripts/shots.mjs`).

## Notes

- Once a hotel has `alert_email` set, the old "new booking" notification is skipped for it
  (`src/lib/notifications/index.ts`, existing C2 rule), so the C2 email takes its place.
  New hotels now follow the same rule as Aracuya.
- Hotels that signed up before this change still have no `alert_email`. They can set it in
  Settings, or it can be filled by hand.
