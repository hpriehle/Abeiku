# F2: admin reliability, WhatsApp bot off, widget Book button, login hardening (2026-11-15)

Branch `chat/abeiku-f2-reliability`, based on `chat/abeiku-combined-test` (F1 + C1). Nothing is deployed, pushed or merged, and no production data was written. The new migration file has **not** been applied.

## Result

| Check | Before (base `bab0da0`) | After |
|---|---|---|
| `npm run lint` | 32 problems (**8 errors**, 24 warnings) | 24 problems (**0 errors**, 24 warnings, all from before F2) |
| `npm test` | 10 files, 80 tests (F1 report) | **20 files, 147 tests, all pass** |
| `npm run build` | passes | **passes** |
| Browser checks (`scripts/verify.mjs`) | n/a | **12/12 pass** (`verify-results.json`, screenshots `*.png`) |

## 1. Admin actions show a clear error, with loading states and no double submits

All admin actions now go through one small helper.
- `src/lib/admin/api-client.ts`: `apiRequest()` never throws. It returns `{ok, data}` or `{ok:false, error}` with a sentence a hotel owner can read. 401 becomes "session expired", 429 "too many attempts", 5xx a generic "something went wrong on our side". Network errors are covered too. It never shows raw JSON or stack text, and it treats `{success:false}` as a failure. `singleFlight()` ignores a second call while the first is still running.
- `src/app/admin/useAdminAction.tsx`: `useAdminAction()` (pending key, error, one action at a time), `<ErrorNotice>` (`role="alert"`, can be dismissed) and `<FormStatus>`.
- The colours are new shared classes in `globals.css`, next to the F1 ones: `admin-error`, `admin-error-dismiss`, `admin-success`.

| Screen | Before | Now |
|---|---|---|
| Booking modal (`BookingDetailModal.tsx`) | A failed check-in/out, cancel, date change or payment change did nothing. A failed load called `onClose()` during render. | The error shows in the modal and the modal stays open. Buttons say "Checking in…", "Cancelling…" and so on, and all are disabled while an action runs. Dates are checked first (check-out must be after check-in). A failed load shows a message and a Close button. The cancel text now says Abeiku does not send money back (audit B3). |
| Rooms list (`RoomTable.tsx`) | Delete and reorder ignored errors. Reorder left the new order on screen even when it wasn't saved. | Delete: an error shows and the room stays. Reorder: an error shows and the old order comes back. Arrows and Confirm are disabled while busy, with a "Deleting…" label. |
| Room form (`RoomFormModal.tsx`) | Failed image uploads were skipped silently. A failed image removal was ignored. | Each failed upload is listed by file name. A failed image removal shows an error. Submit is guarded against double submits. |
| Message templates (`TemplateEditor.tsx`) | A failed toggle was silent. The toggle did `window.location.reload()`, and after a save the list still showed the old text. | The list is kept in local state, so a save or toggle shows at once. Failures show an alert and the switch doesn't move. There is a "saved" notice. The API now rejects unknown template types and empty text. The "set up WhatsApp" link goes to `/admin/settings/whatsapp`. |
| Notification toggles (`NotificationSettings.tsx`) | Showed "saved" even when the server said no. It only reverted on a network error. | It reverts on any failure and names the setting that failed. Toggles are disabled while saving. |
| Settings saves (`SettingsForm`, `WhatsAppForm`, `CalendarPicker`, `GoogleReviewsForm`) | Said "Failed to save", and success or error was guessed from the message text. | Friendly messages, a typed ok/error status (`role=status/alert`) and double-submit guards. The Settings page now shows the result of Google Calendar connect (`?calendar=connected/error&reason=`), which it used to ignore. |
| MoMo / Paystack forms (UI only) | Showed the server's `data.error` raw (it can contain upstream text). | Errors pass through `friendlyError()`. MoMo handles the new 429 by going back to "send a new test payment". |
| Partners (`InfluencersClient.tsx`) | Already had error messages (stage A). | Double-submit guards added to create partner, payout and setup link. |
| Dashboard calendar and room grid | A failed month change kept the old month's bookings under the new month's heading. | The bookings are cleared and an error shows. |
| Inbox (`InboxTab.tsx`) | A failed message load was silent. Search fired on every key, and results could arrive out of order. | Errors show for the list and for each thread. Search is debounced (250 ms), and stale responses are ignored. |

## 2. Room edit wiped multi-room pricing (audit B6) and the Paystack duplicate key

- `src/lib/rooms/pricing.ts`:
  - `withBasePrice()` changes only the 1-room tier's price and keeps every other tier and its label.
  - `parsePrice()` rejects an empty, 0 or negative price. Before, an empty price was saved as 0.
  - `validatePricingTiers()` is now checked by `PUT /api/admin/rooms/[id]`.
- `POST /api/admin/rooms` rejects a price ≤ 0 when one is given.
- The form edits the `rooms === 1` tier. Before, it always edited `pricing_tiers[0]`.
- Proof:
  - `src/lib/rooms/pricing.test.ts` (8 tests). A 3-tier room edited to 120 keeps its 2-room and Entire House tiers. The 1-room tier is found even when it isn't first.
  - Browser check `room-edit-keeps-tiers`. The PUT body was captured and not saved: `[{"label":"Entire House","price":1201,"rooms":1}]`. The existing label is kept; before, it was rebuilt from the room type.
  - Browser check `room-empty-price`: "Enter a price per night greater than 0."
  - No production room has more than one tier today, so the multi-tier case is proven by the unit test only.
- Paystack bank list: `key={`${bank.code}-${bank.slug}-${i}`}` (`PaystackForm.tsx`). Paystack returns the same code more than once.

## 3. Abeiku's WhatsApp booking bot is off for guests (per-hotel flag, off by default)

- `src/lib/whatsapp/inbound.ts`:
  - `processInbound()` sends a message to the booking bot (`state-machine.ts`, which is unchanged) only when `hotels.whatsapp_booking_bot_enabled === true`.
  - Otherwise `storeInboundOnly()` creates or updates the conversation and stores the message for the inbox. It sends no reply, no read receipt, no booking and no "Booking Confirmed".
- `recordMessage()` (`chat-logger.ts`) is the same write as `logMessage()`, but the caller can await it, so the serverless function doesn't return before the row is saved. `logMessage()` behaves as before.
- The webhook (`api/whatsapp/webhook/route.ts`) uses `processInbound()`.
- The other paths into the bot are switched off unless the flag is on:
  - `POST /api/booking/dates` returns 403 with "message the hotel" before any booking is created or message sent.
  - The admin Simulator (API returns 409; the page shows "the booking bot is off"). It used to create real booking rows.
- The flag column doesn't exist yet, so every hotel reads as **off**, which is the intended default. Imported bookings still get no automatic messages; the C1 lifecycle filter is unchanged.
- Proof:
  - `src/lib/whatsapp/inbound.test.ts` (5 tests). Bot off: `handleMessage` and `markAsRead` are not called, and the message is recorded with its body and wamid. Bot on: the message goes to the bot.
  - Live: `POST /api/booking/dates` (aracuya) returned 403. `POST /api/admin/simulator` returned 409. Browser check `simulator-bot-off`.

## 4. Widget "Book" button

Maddie confirmed option (a): the bot flag does not affect the widget.

`src/lib/widget/booking-target.ts`, `bookingTarget(hotel)` picks the button, in this order:
1. A booking URL: `hotels.booking_url` (new optional column), else the `HOTEL_BOOKING_URLS` env (JSON, slug → URL), else for `aracuya` `<ARACUYA_URL or https://aracuya.com>/reserve`. Only http(s) URLs are accepted.
2. Otherwise a prefilled WhatsApp message to `whatsapp_display_phone` or `contact_phone` (a person replies). It **no longer falls back to the MoMo payout phone** (audit, Low).
3. Otherwise no button, just "Online booking isn't available here. To book, please contact {hotel} directly."

- This applies to `/widget/[slug]`, the room pages and `/embed`.
- The URL link uses `target="_top"`, so inside the aracuya.com iframe it opens the reserve page in the main window.
- aracuya.com's `/reserve` reads no room or date query, so the link has none.
- Proof:
  - `src/lib/widget/booking-target.test.ts` (7 tests).
  - Live: `/widget/aracuya/embed` and the room page render `<a href="https://aracuya.com/reserve" target="_top">Book now`, with 0 `wa.me` links. Browser check `widget-room-book` at 375px.

## 5. Login hardening

How the rate limit works: attempts are kept in **a small Supabase table, `auth_attempts`**, in the new additive migration. If the table is missing or Supabase errors, the code **falls back to in-memory counting** for that function instance (logged once), so login never breaks.
- Until the migration is applied, the limit holds only per warm Netlify instance.
- Emails are never stored: account keys are SHA-256 hashed.
- Code: `src/lib/auth/rate-limit.ts`.

| What | Rule | Where |
|---|---|---|
| Admin login | 10 failed tries per 15 min, per IP **and** per account, then 429 with `Retry-After` and "please wait N minutes". Unknown emails now also run a bcrypt compare (dummy hash), so response time doesn't reveal which emails exist. A successful login clears the account counter. | `api/admin/auth/route.ts` |
| Partner login | The same limits, with the account keyed by email or normalised WhatsApp number. | `api/partner/auth/login/route.ts` |
| MoMo verification | 5 wrong amounts per verification (keyed by hotel + verification ref). Each wrong answer says how many tries are left. On the 5th, the pending check is cancelled and a new test payment must be sent (sends are already limited per day). The payment logic itself is unchanged. | `api/admin/momo/confirm-verification/route.ts` |
| Google OAuth `state` | `/api/auth/google` sets a random nonce, tied to the hotel, in an httpOnly cookie (10 min, path `/api/auth/google`) and in `state`. The callback rejects a missing or mismatched state with `reason=state_mismatch` and clears the cookie. `reason` is now URL-encoded. | `src/lib/calendar/oauth-state.ts`, `api/auth/google/*` |

Proof:
- Tests:
  - `rate-limit.test.ts` (8): the 11th try is blocked, the limit works per account across IPs and per IP across accounts, and the fallback works when Supabase fails.
  - `api/admin/auth/route.test.ts` (4): 429 even with the right password after 10 failures; unknown emails still run bcrypt.
  - `momo/confirm-verification/route.test.ts` (2): the countdown, then cancelled on the 5th wrong amount.
  - `oauth-state.test.ts` (2).
- Live, against local dev, with a fake email so no real account was touched:
  - Admin login: `401 ×10, then 429`, `retry-after: 893`, "Too many attempts. Please wait 15 minutes and try again."
  - Partner login: `401 ×10, then 429`.
  - The dev log shows the fallback warning once, as expected because the table doesn't exist.
  - OAuth start redirects to Google with `state=…` and sets `g_oauth_state`. The callback with a forged state redirects to `/admin/settings?calendar=error&reason=state_mismatch`.

## 6. Lint, from 8 errors to 0

| Error | Fix |
|---|---|
| `InboxTab.tsx` (×2): setState inside an effect | The effects fetch, then set state in `.then` (with cancel and debounce). Selecting a conversation resets the thread in the click handler. |
| `MessageThread.tsx`: variable reassigned during render | The date chip is computed from the previous message, by index. |
| `MoMoForm.tsx`: setState inside an effect | The countdown only shows while waiting for confirmation, so there's no reset in the effect. |
| `CurrencyContext.tsx`: setState inside an effect | `loadRate()` (cache, else fetch) runs async, then sets state. |
| `PhoneChat.tsx` (×2): self-reference and setState inside an effect | The loop restarts through a ref, and the first run is scheduled with `setTimeout(…, 0)`. This is the landing-page demo; it plays the same. |
| `onboarding/page.tsx`: prefer-const | `let` changed to `const`. |
| `state-machine.ts`: `useReferralCode` treated as a React hook | Imported as `redeemReferralCode`. Same function, same behaviour. |

The 24 warnings that remain were there before F2: unused variables in `src/lib/db/index.ts` (10), `state-machine.ts` (4), `communication/report/page.tsx`, `CalendarPicker.tsx`, `api/admin/calendar`, `chats/conversations/[id]/messages`, `chats/reply`, `cron/lifecycle` and `components/BookingCalendar.tsx`, plus `no-img-element` in `ReviewsList.tsx` and `RoomFormModal.tsx`. The full list is in `lint-warnings.txt`.

## Migration: written, NOT applied

`supabase-migration-f2-reliability.sql` (additive only):
- table `auth_attempts`, with RLS on and no policies;
- `hotels.whatsapp_booking_bot_enabled BOOLEAN NOT NULL DEFAULT false`;
- `hotels.booking_url TEXT`.

Everything works without it (see the fallbacks above). A read-only check confirmed that neither the table nor the columns exist in production today.

## How the checks were run (read-only)

- `npm test`, `npm run lint`, `npm run build` in this worktree.
- `next dev -p 3020` with `.env.local` (production Supabase; gitignored, not committed).
- `scripts/verify.mjs` signs a local admin session for **Aracuya**, because test-hotel has no rooms or bookings to click. It intercepts **every non-GET request in the browser**: most are answered with a fake 500 to show the error path, and some with a fake 200 after the request body is captured. Nothing reached the server's write paths.
- The live API checks used a non-existent email.
- `POST /api/booking/dates` and the simulator returned before any write.
- The WhatsApp webhook was not exercised live: no hotel has a `phone_number_id`, so it would only log "no hotel". This is covered by unit tests.

## Small decisions I made (easy to change)

- The Simulator is switched off with the bot, because it creates real booking rows.
- With the bot off, Abeiku sends no read receipt (blue ticks) for incoming messages, since no person has read them yet.
- The cancel-booking text now says no money is sent back automatically. The server still marks paid bookings "refunded" on cancel; that payment logic is not touched (audit B3).
- The MoMo attempt limit is 5 per verification, and the login limit is 10 per 15 min per IP and per account.
- Booking URL order: hotel column, then the `HOTEL_BOOKING_URLS` env, then the Aracuya default. This mirrors how `PARTNER_SITE_URLS`/`ARACUYA_URL` already work for partner links.

## Not done / for Harrison

- **Apply `supabase-migration-f2-reliability.sql`** so the login and MoMo limits are shared across Netlify instances. Until then they hold per warm instance only. Optional: set `hotels.booking_url` for aracuya; the code already defaults to `https://aracuya.com/reserve`.
- Onboarding (`/admin/onboarding`) still swallows Google Places errors and posts rooms one at a time (audit). Review-funnel and Embedded Signup errors are also not reworked. They weren't in this step's list.
- The "Dev: Run Onboarding" button is still on Settings (audit). I didn't remove it because it wasn't in scope.
