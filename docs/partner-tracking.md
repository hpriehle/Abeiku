# Partner tracking (Aracuya affiliates)

Partners (agencies, local referrers, influencers) share `https://aracuya.com/?ref=CODE`.
Aracuya saves the code on the booking and reports paid / refunded / cancelled bookings
to Abeiku. Abeiku computes the commission, shows it on the partner's dashboard, and lists
what is owed so payouts can be made by hand (MoMo).

## Apply the migration

Run in the Supabase SQL editor, in this order (neither has been run yet):

1. `supabase-migration-influencers.sql` (partners + click tables)
2. `supabase-migration-partner-bookings.sql` (partner type, currency, commission rule,
   `referral_bookings`, `referral_booking_events`, RLS on)

## Env var

| Name | Where | What |
| --- | --- | --- |
| `ABEIKU_REFERRAL_SECRET` | Abeiku (Netlify) and aracuya.com | Shared secret for the report API. If unset, the API rejects every call (401). |
| `ARACUYA_URL` | Abeiku, optional | Base for partner links, default `https://aracuya.com`. |

## API: report a booking

`POST https://abeiku.com/api/public/referral/aracuya/booking` (`aracuya` = hotel slug)

Header: `Authorization: Bearer <ABEIKU_REFERRAL_SECRET>` (compared in constant time).

```json
{
  "event": "paid",
  "booking_ref": "ARA-1001",
  "ref_code": "kofi-tours",
  "check_in": "2026-12-20",
  "check_out": "2026-12-23",
  "nights": 3,
  "room_total_usd": 600,
  "total_ghs": 9000,
  "ghs_per_usd": 15,
  "amount_paid": 600,
  "currency": "USD",
  "paid_at": "2026-11-14T10:00:00Z"
}
```

- `event`: `paid` | `refunded` | `cancelled`.
- `paid` requires `booking_ref`, `ref_code`, `check_in`, `check_out`, `nights`, and
  `room_total_usd` or `total_ghs`. `refunded` / `cancelled` need only `booking_ref`.
- `ref_code` is case-insensitive.

Responses:

| Status | When |
| --- | --- |
| 200 `{ok:true, partner_found:true}` | stored |
| 200 `{ok:true, partner_found:false}` | stored, but no partner has that code (shown under "Unknown codes" in admin) |
| 200 `{ok:true, duplicate:true}` | this `booking_ref` + `event` was already received; nothing changed |
| 400 | bad body (message lists the problems) |
| 401 | missing / wrong secret |
| 404 | unknown hotel slug |
| 500 | storage failed; the event is not recorded, so retrying is safe |

Idempotency: every event is logged in `referral_booking_events`, unique on
(hotel, booking_ref, event). Aracuya calls this twice per paid booking; the second call is a no-op.
A refund that arrives before the paid event is not undone by the paid event.

## Commission

Each partner has a currency (Ghana = GH₵, abroad = USD) and a rule, set when created:

| Rule | Ghana partner (GHS) | Partner abroad (USD) |
| --- | --- | --- |
| percent | pct x `total_ghs` | pct x `room_total_usd` |
| per_night | value x `nights` | value x `nights` |

If the partner's total is missing it is converted with `ghs_per_usd`.
Defaults: agency 15%; local GH₵150/night (Ghana); influencer has no default (rule required).
The commission is stored on the booking when the paid event arrives; changing a partner's
rule later does not change existing bookings.

Status shown to partner and admin:

- **pending**: paid, check-out date not yet passed
- **owed**: paid, check-out date has passed (from the day after check-out), not paid out
- **paid**: payout marked in admin
- **refunded / cancelled**: commission 0, never owed (unless the payout was already made, then it stays "paid")

## Create a partner

1. Admin > **Partners** > **+ New partner**.
2. Fill name, email (their login), type, Ghana/abroad (sets currency), ref code
   (2-40 letters/digits/hyphens, unique), commission rule (prefilled from type).
3. **No email is sent.** The page shows a setup link (`/partner/setup?token=…`, valid 14 days).
   Copy it into your message to the partner. If it expires, click "new setup link" on their row.
4. The partner sets a password and lands on `/partner/dashboard` with their link and bookings.

## Pay a partner

Admin > Partners > Bookings, filter **Owed** > **Mark paid** (date, note such as the MoMo
reference). "undo" reverts it. Only owed bookings can be marked paid. No MoMo API is called.

## Tests

`npm test` (vitest): commission math, status derivation, idempotency, validation, auth.
