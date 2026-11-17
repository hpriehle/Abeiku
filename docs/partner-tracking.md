# Partner tracking (Aracuya affiliates)

Partners (agencies, local referrers, influencers) share `https://aracuya.com/?ref=CODE`.
Aracuya saves the code on the booking and reports paid / refunded / cancelled bookings
to Abeiku. Abeiku computes the commission, shows it on the partner's dashboard, and lists
what is owed so payouts can be made by hand (MoMo).

## Apply the migration

Run in the Supabase SQL editor, in this order (neither has been run yet):

1. `supabase-migration-influencers.sql` (partners + click tables)
2. `supabase-migration-partner-bookings.sql` (partner type, currency, commission rule,
   WhatsApp / town / GHL contact id, email made optional, `referral_bookings`,
   `referral_booking_events`, RLS on)

## Env var

| Name | Where | What |
| --- | --- | --- |
| `ABEIKU_REFERRAL_SECRET` | Abeiku (Netlify) and aracuya.com | Shared secret for the report API. If unset, the API rejects every call (401). |
| `ABEIKU_ADMIN_API_SECRET` | Abeiku (Netlify) and the caller (aracuya desk) | Secret for the admin partner API (`/api/admin/partners*`). If unset, those endpoints reject every call (401). Use a different value from `ABEIKU_REFERRAL_SECRET`. |
| `ABEIKU_PARTNER_API_KEY` | Abeiku (Netlify) and Siteboard | Key for `POST /api/partners/invite-link`. If unset, that endpoint refuses every call (503). Use its own value, not one of the secrets above. |
| `ARACUYA_URL` | Abeiku, optional | Base for Aracuya's partner links, default `https://aracuya.com`. |
| `PARTNER_SITE_URLS` | Abeiku, optional | JSON map of hotel slug to the site partner links point to, e.g. `{"other-hotel":"https://other-hotel.com"}`. A hotel that is not listed (other than Aracuya) gets no partner link. |

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

## Partner fields

- **Ref code**: issued by Abeiku. If none is given it is made from the name, lowercase,
  words joined with `-` ("Carmen's Travels" -> `carmen-travels`); if taken, `-2`, `-3`, ...
  is added. Once created, a code is never changed by the API (links may already be out).
- **WhatsApp**: E.164 (`+233241234567`). Spaces, dashes and a `00` prefix are accepted;
  local numbers without a country code (`024…`) are rejected. Unique per hotel.
- **Email**: optional, unique when present. A partner needs an email or a WhatsApp number.
- **Town**, **GHL contact id**: optional, stored as given.
- Partners log in with their email **or** WhatsApp number plus the password they set.

## Create a partner (admin page)

1. Admin > **Partners** > **+ New partner**.
2. Fill name, WhatsApp and/or email, town, type, Ghana/abroad (sets currency), ref code
   (optional: leave empty to have one made from the name), commission rule (prefilled from type).
3. **No email is sent.** The page shows a setup link (`/partner/setup?token=…`, valid until used).
   Copy it into your message to the partner. "New setup link" on their row replaces it (the old
   link stops working).
4. The partner sets a password and lands on `/partner/dashboard` with their link and bookings.

## Admin API: create partners in bulk

`POST https://abeiku.com/api/admin/partners/bulk`

Header: `Authorization: Bearer <ABEIKU_ADMIN_API_SECRET>` (constant time). Sends no email or
messages; it only returns links for the caller to deliver.

```json
{
  "hotel_slug": "aracuya",
  "partners": [
    {
      "name": "Carmen's Travels",
      "type": "agency",
      "town": "Accra",
      "whatsapp": "+233241234567",
      "email": "carmen@example.com",
      "country": "Ghana",
      "code": "optional-own-code",
      "rule": { "kind": "percent", "value": 15 },
      "ghl_contact_id": "optional"
    }
  ]
}
```

- Required per partner: `name`, `type` (`agency` | `local` | `influencer`), `country`, and
  `whatsapp` or `email`. `town`, `code`, `rule`, `ghl_contact_id` are optional.
- `rule`: `{"kind": "percent", "value": 15}` (15%) or `{"kind": "per_night", "value": 150}`
  (per night, in the partner's currency). Omitted: agency 15%, local GH₵150/night in Ghana.
  Required for influencers and for local partners outside Ghana.
- Currency: `country` "Ghana" = GHS, anything else = USD.
- Up to 200 partners per call, processed in order.

**Idempotent.** A partner with the same WhatsApp number or email in the hotel is updated, not
duplicated (name, type, country, rule; whatsapp/email/town/ghl_contact_id only when given).
Its code stays. If no `rule` is sent on an update, the current rule is kept unless the type or
country changed (then the type default applies). If the WhatsApp number matches one partner
and the email another, the item fails.

**Setup link.** Returned while the partner has not set a password. A link that is still valid
is returned again unchanged (calling again never invalidates a link already sent); a new one
is issued only when there is none (or an old dated one expired). Setup links have no expiry
(`invite_expires_at` null) and stay valid until the partner sets a password. `null` once the
partner is set up.

Response 200 (also when some items failed):

```json
{
  "hotel_slug": "aracuya",
  "counts": { "created": 1, "updated": 0, "error": 1 },
  "results": [
    {
      "name": "Carmen's Travels",
      "code": "carmen-travels",
      "ref_link": "https://aracuya.com/?ref=carmen-travels",
      "setup_link": "https://abeiku.com/partner/setup?token=…",
      "status": "created"
    },
    {
      "name": "No Contact",
      "code": null,
      "ref_link": null,
      "setup_link": null,
      "status": "error",
      "error": "whatsapp or email is required"
    }
  ]
}
```

`results` is in the same order as `partners`. A bad item only fails itself. Other statuses:
400 (no `hotel_slug`, empty or >200 `partners`), 401 (bad/missing secret), 404 (unknown hotel).

## Admin API: list partners

`GET https://abeiku.com/api/admin/partners?hotel_slug=aracuya` (same header). Read-only.

Each partner: `id`, `name`, `code`, `ref_link`, `setup_link` + `setup_expires_at` (only while
not set up and the link is still valid; `setup_expires_at` is `null` for a link valid until used), `set_up`,
`whatsapp`, `email`, `town`, `type`, `country`, `currency`, `rule`, `ghl_contact_id`,
`bookings`, `totals` `{pending, owed, paid}` in the partner's currency.

## Siteboard API: a partner's setup link

For Siteboard Campaigns: when a partner is marked Yes, Siteboard asks Abeiku for the partner's
link and sends it by email and WhatsApp itself. **Abeiku sends nothing**; it only makes the link.

`POST https://abeiku.com/api/partners/invite-link`

Header: `Authorization: Bearer <ABEIKU_PARTNER_API_KEY>` (compared in constant time). If the env
var is not set on Abeiku, every call gets 503.

Body:

| Field | Required | Notes |
| --- | --- | --- |
| `hotel` | yes | Hotel slug, e.g. `aracuya`. |
| `name` | yes | Partner name. Used only when a new partner is created. |
| `whatsapp` | one of these | International number; `+233 24 123 4567`, `00233241234567` work. |
| `email` | one of these | Matched lowercased. |
| `type` | no | `local` (default), `agency` or `influencer`. New partners only. |
| `country` | no | Default `Ghana` (GH₵). Any other country = USD. New partners only. |
| `rule` | no | `{"kind":"percent"\|"per_night","value":n}`. Default from type (local in Ghana GH₵150/night, agency 15%); required for `influencer` and for `local` abroad. |
| `town` | no | New partners only. |

What it does, in order:

1. Finds the partner **in that hotel** by WhatsApp number, then by email. WhatsApp wins if the
   two point at different partners. A partner that is found is not changed (name, type, rule
   stay as the hotel set them).
2. None found: creates one (code made from the name, like the admin bulk add). The email must
   not belong to a partner of another hotel (409).
3. Partner already set a password: returns the partner login URL (`status: "active"`).
4. Otherwise returns the setup link (`status: "setup"`). A still-valid link is returned again
   unchanged, so calling twice never breaks a link already sent. Setup links never expire;
   they stop working once the partner sets a password.

Response `201` (created) or `200` (found):

```json
{
  "partnerId": "6f1c…",
  "status": "setup",
  "url": "https://abeiku.com/partner/setup?token=…",
  "partnerLink": "https://aracuya.com/?ref=esi-shop",
  "code": "esi-shop",
  "created": true,
  "type": "local",
  "commission": { "kind": "per_night", "value": 150, "currency": "GHS" }
}
```

`status: "active"` comes with `url: "https://abeiku.com/partner/login"`. `partnerLink` is `null`
for a hotel with no partner site set up (see `PARTNER_SITE_URLS`).

Errors (`{"error": "…"}`): `400` bad body (no `hotel`/`name`, neither `whatsapp` nor `email`,
bad number/email/type/rule), `401` wrong key, `404` unknown hotel, `409` email used by another
hotel's partner or a duplicate code/number, `503` key not configured, `500` other.

```bash
curl -sS -X POST https://abeiku.com/api/partners/invite-link \
  -H "Authorization: Bearer $ABEIKU_PARTNER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"hotel":"aracuya","name":"Esi Shop","whatsapp":"+233245550000","email":"esi@example.com"}'
```

## Pay a partner

Admin > Partners > Bookings, filter **Owed** > **Mark paid** (date, note such as the MoMo
reference). "undo" reverts it. Only owed bookings can be marked paid. No MoMo API is called.

## Tests

`npm test` (vitest): commission math, status derivation, idempotency, validation, auth;
ref code generation and de-duplication, bulk upsert (idempotency, partial failure, setup
links), list totals.
