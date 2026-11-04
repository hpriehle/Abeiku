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

## Checklist

### 1. Business portfolio (Harrison, in the browser)
- [ ] business.facebook.com → Create Business → "Abeiku"
- [ ] Security Centre → Start verification (legal name, address, document). Takes days.
- [ ] Add a business email/phone and website (the deployed Abeiku URL, see step 3).

### 2. Connect the app to the portfolio
- [ ] App settings → Basic → Business portfolio = Abeiku
- [ ] App settings → Basic: App domain, Privacy Policy URL, Terms URL, category, icon
      (needed for Live mode and App Review)
- [ ] Copy **App Secret** into `.env.local` / Beelink env as `WHATSAPP_APP_SECRET`.
      `WHATSAPP_APP_ID` and `NEXT_PUBLIC_WHATSAPP_APP_ID` = `1416351276566026`

### 3. Public HTTPS host (Beelink + Cloudflare tunnel)
- [ ] Deploy to `~/apps/abeiku` on riehle-01, with a Cloudflare tunnel hostname
      (e.g. `abeiku.riehle.co`; pick the final domain)
- [ ] Set `NEXT_PUBLIC_APP_URL` to that URL

### 4. Webhook
- [ ] App Dashboard → WhatsApp → Configuration → Callback URL
      `https://<host>/api/whatsapp/webhook`, Verify token = `WHATSAPP_VERIFY_TOKEN`
- [ ] Subscribe fields: `messages`, `message_template_status_update`, `account_update`,
      `history`, `smb_app_state_sync`, `smb_message_echoes`
- Every POST is checked against `X-Hub-Signature-256` with `WHATSAPP_APP_SECRET`.

### 5. Facebook Login for Business configuration
- [ ] Add product "Facebook Login for Business" → Configurations → Create →
      template "WhatsApp Embedded Signup". Permissions: `whatsapp_business_management`,
      `whatsapp_business_messaging`. Token: system-user (business integration) token.
- [ ] Copy the Configuration ID into `WHATSAPP_CONFIG_ID` and `NEXT_PUBLIC_WHATSAPP_CONFIG_ID`
- [ ] Facebook Login for Business → Settings: add the Abeiku host to Allowed domains
      for the JavaScript SDK

### 6. Become a Tech Provider
- [ ] App Dashboard → WhatsApp → Quickstart → follow "Become a Tech Provider"
      (needs the verified business from step 1)
- [ ] App Review: Advanced Access for `whatsapp_business_management` and
      `whatsapp_business_messaging`. Needs screencasts of Embedded Signup and of sending
      a template from the Abeiku dashboard.
- [ ] Access verification, then switch the app to Live

### 7. Database
- [ ] Run `supabase-migration-whatsapp-templates.sql` in the Supabase SQL editor
      **before** connecting a hotel. It adds the bot switch, coexistence flags and
      delivery-status columns.

### 8. Connect Aracuya
- [ ] Aracuya phone: WhatsApp Business app ≥ 2.24.17, number active, app open
- [ ] Admin → Settings → WhatsApp → Connect WhatsApp → "Connect your existing WhatsApp Business app"
- [ ] Enter the code shown in the popup in the app (Settings → Account → Business Platform),
      accept chat-history sharing
- [ ] Abeiku starts the contacts + history sync automatically. Meta requires that within 24h,
      or the number must be offboarded and re-onboarded.
- [ ] Check: `GET /<phone_number_id>?fields=is_on_biz_app,platform_type` → `true`, `CLOUD_API`

### 9. Templates
- [ ] Admin → Communication → WhatsApp Templates → New template → Submit for review
- [ ] Once approved, send from the same page. Replies land in the Inbox.

## Testing before verification is done

In development mode, the app can use Meta's **test number** (WhatsApp → API setup)
to message up to 5 verified recipients, with the pre-approved `hello_world` template.
Paste its temporary token, phone number ID and WABA ID into Settings → WhatsApp →
manual credentials to try the dashboard end to end. The token expires in 24h.

## Behaviour notes

- **Bot is off by default** (`hotels.whatsapp_booking_bot_enabled`). Incoming messages are
  logged to the inbox with no auto-reply and no read receipt. Turn it on per hotel in
  Settings → WhatsApp.
- Messages staff send from the WhatsApp Business app arrive as `smb_message_echoes`
  and show in the inbox as sent by "WhatsApp Business app".
- Delivery status (sent / delivered / read / failed + error) is stored on `chat_messages`.

## Follow-ups not built yet
- Import synced chat history (`history` webhook) into the inbox; it's only acknowledged for now.
- Lifecycle reminders (`src/lib/lifecycle`) still send free text, which fails outside
  the 24h window. Map each reminder type to an approved template.
- Show `wa_status` ticks in the inbox thread, and a "Send template" button in ReplyBox when
  the 24h window is closed.
- Handle `account_update` PARTNER_REMOVED by clearing the hotel's credentials.
- Media headers (image/video/document) in the send form.
