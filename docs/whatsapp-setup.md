# WhatsApp setup (Meta) for Abeiku

Goal: hotels send Meta-approved WhatsApp templates from the Abeiku dashboard,
from their **existing WhatsApp Business app number** (coexistence), and keep
using the app on their phone.

Meta app: **Abeiku**, App ID `1416351276566026` (developers.facebook.com, currently in development mode).

## Why it's set up this way

- Business-initiated messages, and any message more than 24h after the guest's
  last message, must be an approved **template**. Free text fails (error 131047).
- Keeping a number in the WhatsApp Business app while using the API is
  "coexistence". Meta only offers it through **Embedded Signup**, and only to apps
  that are a **Tech Provider**. That needs a **verified business portfolio**.
- Embedded Signup v2/v3 died on 2026-10-15. Abeiku uses **v5** (`extras: { version: "v5" }`),
  where coexistence is on by default.
- Coexistence numbers are limited to 20 messages/sec. Messages sent from the app stay free;
  API messages are billed at Cloud API rates.

## Status (2026-11-16)

- The 2FA restriction that blocked every business-asset action (2026-11-04) is solved:
  as of 2026-11-16 15:18 Harrison Riehle and Ashley Riehle are both admins of the app and of
  the **Automaddie** portfolio (ID `1116214052281089`, verified).
- The number to connect by coexistence, **+233 59 795 7528**, already sits in Automaddie
  (unverified, display name in review).
- Host: **abeiku.com on Netlify** (the old Beelink + Cloudflare tunnel plan is dropped).
- Code (branch `chat/abeiku-w2-code`): webhook with signature check, inbox with replies,
  manager WhatsApp booking alerts. Not deployed yet.

## Values to enter

| Where | Value |
|---|---|
| Callback URL | `https://abeiku.com/api/whatsapp/webhook` |
| Verify token | the value of `WHATSAPP_VERIFY_TOKEN` on Netlify (make one: `openssl rand -hex 24`) |
| Webhook fields | `messages`, `message_template_status_update`, `account_update`, `history`, `smb_app_state_sync`, `smb_message_echoes` |
| App domain / JS SDK allowed domain | `abeiku.com` |
| Manager alert number | `+233 55 154 2355` (Settings → WhatsApp booking alerts, or `docs/go-live-whatsapp.sql`) |

### Netlify environment variables (Site configuration → Environment variables)

| Name | Value | Notes |
|---|---|---|
| `WHATSAPP_APP_SECRET` | App settings → Basic → App secret | Secret. Webhook POSTs are refused (401) while it is missing. |
| `WHATSAPP_VERIFY_TOKEN` | random string you choose | Same string goes in the Meta webhook form. |
| `WHATSAPP_APP_ID` | `1416351276566026` | Server side (Embedded Signup callback). |
| `NEXT_PUBLIC_WHATSAPP_APP_ID` | `1416351276566026` | Built into the page: redeploy after setting. |
| `NEXT_PUBLIC_WHATSAPP_CONFIG_ID` | Facebook Login for Business configuration ID | Built into the page: redeploy after setting. |
| `WHATSAPP_ALERT_TEMPLATE` | optional, default `booking_alert` | Template used for manager alerts. |
| `WHATSAPP_ALERT_TEMPLATE_LANG` | optional, default `en` | |
| `WHATSAPP_ALERT_SENDER_HOTEL_ID` | optional, a hotel id, e.g. `013b60e4-e55f-46f9-966b-70e0773f42e4` (Test Hotel, Meta test number) | Platform alert sender: hotels with a manager alert number but no WhatsApp number of their own send their booking alerts from this hotel's connected number. The text still names the alerting hotel ("Booking alert for Aracuya: …"). A hotel with its own number always uses its own. The `booking_alert` template must be approved on the sender's WhatsApp Business Account; with Meta's test number, the manager number must also be on the test number's recipient list. Unset it once the hotel connects its own number (not required: its own number wins anyway). |

Hotels' own access tokens and phone number IDs are stored per hotel in the database
(Embedded Signup writes them), not in env.

## Checklist

### 1. Business portfolio
- [x] Use Automaddie (verified) as the Tech Provider business
- [x] 2FA account restriction cleared; Harrison and Ashley are admins (2026-11-16)

### 2. Connect the app to the portfolio
- [ ] App settings → Basic → Business portfolio = Automaddie
- [ ] App settings → Basic: App domain `abeiku.com`, Privacy Policy URL, Terms URL, category, icon
      (needed for Live mode and App Review; Privacy/Terms pages are plan step L3)
- [ ] Copy **App Secret** into Netlify as `WHATSAPP_APP_SECRET` (never into the repo)

### 3. Database
- [ ] Run `docs/go-live-whatsapp.sql` in the Supabase SQL editor **before** connecting a hotel.
      It adds coexistence flags, delivery-status columns and `hotels.alert_whatsapp`
      (and sets Aracuya's to +233 55 154 2355).

### 4. Deploy
- [ ] Set the Netlify env vars above, merge the PR, deploy abeiku.com.
- [ ] Check: `curl -s "https://abeiku.com/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=<token>&hub.challenge=ok"`
      prints `ok`; with a wrong token it returns 403.
- [ ] Check: an unsigned POST is refused:
      `curl -s -o /dev/null -w '%{http_code}' -X POST https://abeiku.com/api/whatsapp/webhook -d '{}'` → `401`.

### 5. Webhook (App Dashboard → WhatsApp → Configuration)
- [ ] Callback URL `https://abeiku.com/api/whatsapp/webhook`, Verify token = `WHATSAPP_VERIFY_TOKEN`
      → Verify and save (Meta calls the GET above; it must be deployed first)
- [ ] Webhook fields → Subscribe: `messages`, `message_template_status_update`, `account_update`,
      `history`, `smb_app_state_sync`, `smb_message_echoes`
- Every POST is checked against `X-Hub-Signature-256` (HMAC-SHA256 of the raw body with
  `WHATSAPP_APP_SECRET`). Bad or missing signature → 401, nothing stored.

### 6. Facebook Login for Business configuration
- [x] Add product "Facebook Login for Business"; turn on Login with the JavaScript SDK
- [ ] Configurations → Create (only after the portfolio link; the variation can't be changed later) →
      template "WhatsApp Embedded Signup". Permissions: `whatsapp_business_management`,
      `whatsapp_business_messaging`. Token: system-user (business integration) token.
- [ ] Copy the Configuration ID into Netlify `NEXT_PUBLIC_WHATSAPP_CONFIG_ID`, redeploy
- [ ] Facebook Login for Business → Settings: Allowed domains for the JavaScript SDK = `https://abeiku.com`

### 7. Become a Tech Provider
- [ ] App Dashboard → WhatsApp → Quickstart → follow "Become a Tech Provider"
      (Automaddie is already verified)
- [ ] App Review: Advanced Access for `whatsapp_business_management` and
      `whatsapp_business_messaging`. Needs screencasts of Embedded Signup and of sending
      a template from the Abeiku dashboard.
- [ ] Access verification, then switch the app to Live

### 8. Connect Aracuya's number +233 59 795 7528 (coexistence)
- [ ] Aracuya phone: WhatsApp Business app ≥ 2.24.17, number active, app open
- [ ] Admin → Settings → WhatsApp → Connect WhatsApp → "Connect your existing WhatsApp Business app"
- [ ] Enter the code shown in the popup in the app (Settings → Account → Business Platform),
      accept chat-history sharing
- [ ] Abeiku starts the contacts + history sync automatically. Meta requires that within 24h,
      or the number must be offboarded and re-onboarded.
- [ ] Check: `GET /<phone_number_id>?fields=is_on_biz_app,platform_type` → `true`, `CLOUD_API`

### 9. Templates
- [ ] Admin → Communication → WhatsApp Templates → New template → Submit for review
- [ ] **Manager booking alert** (needed for WhatsApp alerts): name `booking_alert`, category
      Utility, language English (`en`), body:
      `Booking alert for {{1}}: {{2}}. Details are in your Abeiku calendar.`
      Examples: `{{1}}` = `Aracuya`, `{{2}}` = `New booking: Ama Mensah, 20–23 Nov, 1 room (Airbnb)`.
      Abeiku fills `{{1}}` with the hotel name and `{{2}}` with the alert email's subject line.
- [ ] Once approved, send from the same page. Replies land in the Inbox.

### 10. First real test (only after Harrison's go)
- [ ] Send a WhatsApp from a test phone to +233 59 795 7528 → it shows in Admin →
      Communication → Inbox within 15 seconds; reply from the inbox → arrives on the phone.
- [ ] A test booking → email to the alert address and a WhatsApp to +233 55 154 2355.

## Testing before verification is done

In development mode, the app can use Meta's **test number** (WhatsApp → API setup)
to message up to 5 verified recipients, with the pre-approved `hello_world` template.
Paste its temporary token, phone number ID and WABA ID into Settings → WhatsApp →
manual credentials to try the dashboard end to end. The token expires in 24h.

## Behaviour notes

- **No booking bot.** People at the hotel reply to guests. Incoming messages are stored for
  the inbox with no auto-reply and no read receipt. The old bot only runs for a hotel whose
  `hotels.whatsapp_booking_bot_enabled` is true; there is no switch for it in the admin
  (full booking bot is a later plan step).
- **Inbox** (Admin → Communication → Inbox) refreshes every 15 seconds. Free-text replies work
  within 24h of the guest's last message; after that only an approved template can be sent
  (Communication → WhatsApp Templates).
- Messages staff send from the WhatsApp Business app arrive as `smb_message_echoes`
  and show in the inbox as "From the WhatsApp Business app".
- Delivery status (sent / delivered / read / failed + error) is stored on `chat_messages`
  and shown under outbound messages in the thread.
- **Manager booking alerts on WhatsApp**: every new-booking and cancellation email alert
  (src/lib/alerts) is also sent as the `booking_alert` template to `hotels.alert_whatsapp`,
  from that hotel's own connected WhatsApp number or, if it has none, from the platform
  sender (`WHATSAPP_ALERT_SENDER_HOTEL_ID`, src/lib/alerts/alert-sender.ts). It is sent after the email
  succeeds; a WhatsApp failure is logged and not retried, so the manager never gets it twice.
  It never goes to a guest. The arrivals digest stays email only.
- Imported bookings (Airbnb, VRBO, Booking.com, Google calendar, aracuya.com) still never get
  automatic WhatsApp messages to the guest (docs/booking-sources.md). The manager alert is
  not a guest message.

## Follow-ups not built yet
- Import synced chat history (`history` webhook) into the inbox; it's only acknowledged for now.
- Lifecycle reminders (`src/lib/lifecycle`) still send free text, which fails outside
  the 24h window. Map each reminder type to an approved template.
- A "Send template" button in ReplyBox when the 24h window is closed.
- Handle `account_update` PARTNER_REMOVED by clearing the hotel's credentials.
- Media headers (image/video/document) in the send form.
