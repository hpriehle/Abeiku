# P2 partner accounts: new text for review

**Status: DRAFT, held for Harrison's review. Nothing here ships until he approves this doc.**

Every new piece of text a partner or hotel sees in P2 (steps 1, 3, 4). The code already uses these drafts, all from one file: `src/lib/partner/p2-copy.ts`. To change a string, edit it there (and here). Existing text that P2 reuses unchanged (e.g. "Go to sign in", "Owed to you", the setup-link notice) is not listed.

`{hotel}`, `{name}`, `{link}`, `{code}` are filled in. `{login}` is https://abeiku.com/partner/login.

## Partner email (hotel added an existing partner)

Sent when a hotel adds someone who already has an Abeiku partner account with a password. Sent from `notifications@abeiku.com` ("Abeiku"), in the usual Abeiku email frame.

| ID | Where | Draft | Why |
|---|---|---|---|
| C1 | Email subject. `src/lib/partner/p2-copy.ts:19` | `{hotel} added you as a partner` | Says what happened, with the hotel first. |
| C2 | Email body. `src/lib/partner/p2-copy.ts:21-30` | Hi {name},<br><br>{hotel} added you as a partner on Abeiku. You can see it now in your partner account.<br><br>Your link for {hotel}: {link}<br><br>Log in with your usual password: {login} | There's no accept step (his decision), so the email only tells them. "Usual password" says no new account is needed. The link line is left out if the hotel has no partner site yet. |

## WhatsApp message (hotel sends it with one tap)

The hotel gets a "Send on WhatsApp" button that opens WhatsApp on their own phone with this text filled in, the same idea as P1's setup link. Abeiku sends nothing itself.

| ID | Where | Draft | Why |
|---|---|---|---|
| C3 | wa.me text. `src/lib/partner/p2-copy.ts:36-42` | Hi {name}, {hotel} added you as a partner on Abeiku.<br>Your link: {link}<br>Log in with your usual password: {login} | Shorter than the email because it's a chat message. Leaves out the link line if there's no partner site. |

## Hotel admin: Partners page (src/app/admin/influencers)

| ID | Where | Draft | Why |
|---|---|---|---|
| C4 | Error when adding. `src/lib/partner/p2-copy.ts:50`, returned by `src/lib/partner/add-partner.ts:91` | This partner is already on your list. | The email or number belongs to an account that is already this hotel's partner. |
| C5 | Green notice after adding an existing partner. `src/lib/partner/p2-copy.ts:54`, shown at `src/app/admin/influencers/InfluencersClient.tsx:459` | {name} already has an Abeiku partner account. They are now your partner, code {code}. | Explains why there's no setup link to copy this time. |
| C6 | Same notice, after C5 when the email went out. `p2-copy.ts:55` | We emailed them to say so. | Tells the hotel the partner already knows. |
| C7 | Same notice, after C5 when no email went out (no email on file, or sending failed). `p2-copy.ts:56` | We could not email them. Send them a WhatsApp instead. | Points to the button below. |
| C8 | Button in the notice (only if the partner has a WhatsApp number). `p2-copy.ts:57`, `InfluencersClient.tsx:476` | Send on WhatsApp | Opens WhatsApp with C3 filled in. |

If the existing account never set a password (migrated, setup link not used yet), the hotel sees the usual setup-link notice, with no new text.

## Partner setup page (/partner/setup)

Shown when someone opens a setup link but their email already has an account with a password. The hotel is added to that account; the link doesn't change the password.

| ID | Where | Draft | Why |
|---|---|---|---|
| C9 | Page title. `p2-copy.ts:62`, `src/app/partner/setup/page.tsx:58` | You already have an account | Short, says why there's no password form. |
| C10 | Page text (also the API error). `p2-copy.ts:63`, `setup/page.tsx:60`, `src/app/api/partner/auth/set-password/route.ts:49` | You already have an Abeiku partner account with this email. This hotel is now in it. Log in with your password. | Followed by the existing "Go to sign in" button. |

## Partner dashboard (/partner/dashboard)

| ID | Where | Draft | Why |
|---|---|---|---|
| C11 | Label of the hotel switcher (only shown with 2+ hotels). `p2-copy.ts:68`, `src/app/partner/(gated)/dashboard/page.tsx:209` | Hotel | The dropdown lists hotel names, so one word is enough. |
| C12 | New figure next to Owed / Pending / Paid. `p2-copy.ts:69`, `dashboard/page.tsx:124` | Clicks | Shown to every partner (Maddie's answer: clicks counting went live on aracuya.com today). |
| C13 | Hint under the clicks figure. `p2-copy.ts:70`, `dashboard/page.tsx:124` | Times your link was opened | Says what a click means, in the same style as the other hints. |

---

# P2 steps 2 and 5: sign-up, email check, forgot password, payouts (PR on `chat/abeiku-p2-signup-payouts`)

**Status: DRAFT, held for Harrison's review, same as above.** All in `src/lib/partner/p2-copy.ts` (from line 78). `{email}`, `{name}`, `{hotel}`, `{total}`, `{n}` are filled in. Text reused unchanged from the hotel admin forgot-password flow (the "If that email has an account…" answer, "Use at least 8 characters.", "The two passwords don't match.", the link-expired/used/invalid messages, "Go to sign in") is not listed.

## Sign-up page (/partner/signup)

Open to anyone. Not a marketplace: no hotel list, no requests; a hotel adds the partner.

| ID | Where | Draft | Why |
|---|---|---|---|
| C14 | Page title (also the browser tab). `p2-copy.ts:80`, `src/app/partner/signup/page.tsx` | Become a partner | Says what the page is for, from the partner's side. |
| C15 | Subtitle. `p2-copy.ts:81` | Earn commission when guests book a hotel through your link | The one-line reason to sign up. |
| C16 | Line above the form. `p2-copy.ts:82` | Hotels add their own partners. Once a hotel adds you, it shows up in your account. | Sets the expectation before they sign up: no hotel picking here (his decision: not a marketplace). |
| C17 | Field labels, placeholder, hint. `p2-copy.ts:83-88` | Your name · Email · WhatsApp number (placeholder "+233 24 123 4567") · Password (hint "At least 8 characters") | The four things the plan asks for. The placeholder shows the country code is needed. |
| C18 | Button. `p2-copy.ts:89-90` | Create account (while busy: "Creating account…") | |
| C19 | Under the card. `p2-copy.ts:91-92` | Already have an account? **Sign in** | Link to /partner/login. |
| C20 | Title after sign-up. `p2-copy.ts:93` | Check your email | |
| C21 | Text after sign-up. `p2-copy.ts:94-95` | We sent a link to {email}. Open it to confirm your email, then you can sign in. The link works for 48 hours. | Says why they can't sign in yet and for how long the link works. |
| C22 | Error: name missing. `p2-copy.ts:96` | Enter your name. | |
| C23 | Error: bad email. `p2-copy.ts:97` | Enter a valid email address. | |
| C24 | Error: bad WhatsApp. `p2-copy.ts:98` | Enter your WhatsApp number with the country code, for example +233 24 123 4567. | The code never guesses the country (same rule as P1). |
| C25 | Error: email already has an account. `p2-copy.ts:99` | An account with this email already exists. Sign in, or reset your password if you forgot it. | Points to both ways forward. Says the email exists, like hotel sign-up already does. |
| C26 | Error: SQL not run yet. `p2-copy.ts:100` | Sign-up is not open yet. Please try again later. | Only seen before docs/go-live-p2-signup-payouts.sql runs. |

## Confirm email (email + /partner/confirm)

Sent from `notifications@abeiku.com` in the usual frame, same look as the hotel reset email.

| ID | Where | Draft | Why |
|---|---|---|---|
| C27 | Email subject. `p2-copy.ts:106` | Confirm your email for Abeiku | |
| C28 | Email body. `p2-copy.ts:107-117` | Hi {name},<br><br>Thanks for creating an Abeiku partner account. To confirm this is your email, tap the button below.<br><br>**[Confirm my email]**<br><br>The link works for 48 hours and only once. If you didn't sign up, you can ignore this email.<br><br>If the button doesn't work, copy this link into your browser: {link} | Same shape as the hotel reset email. |
| C29 | Confirm page title when the link fails (also the tab title). `p2-copy.ts:123` | Confirm your email | |
| C30 | While the link is checked. `p2-copy.ts:124` | Confirming your email… | On success they go straight to their dashboard (signed in). |
| C31 | Link not valid. `p2-copy.ts:125` | This link isn't valid. Sign in and we'll offer to send a new one. | Sign-in is where "Send the link again" lives (C35). |
| C32 | Link already used. `p2-copy.ts:126` | This link has already been used. If your email is confirmed, just sign in. | Once-only link. |
| C33 | Link expired. `p2-copy.ts:127` | This link has expired. Sign in and we'll offer to send a new one. | |
| C34 | Sign-in refused (right password, email not confirmed). `p2-copy.ts:129`, `src/app/api/partner/auth/login/route.ts` | Confirm your email first. We sent you a link when you signed up. | |
| C35 | Button under C34 on the sign-in page. `p2-copy.ts:130` | Send the link again | |
| C36 | After C35. `p2-copy.ts:131` | If your email still needs confirming, we've sent a new link. Check your inbox (and spam folder). | Same answer whether or not anything was sent. |

## Sign-in page footer and forgot password (/partner/login, /partner/forgot-password)

The footer used to say "Forgot your password, or never set one? Ask your hotel for a new setup link." It now reads C37 / C38 / C39.

| ID | Where | Draft | Why |
|---|---|---|---|
| C37 | Sign-in footer link. `p2-copy.ts:136` | Forgot your password? | Goes to /partner/forgot-password. |
| C38 | Sign-in footer, and under the forgot form. `p2-copy.ts:137` | No email on your account? Ask your hotel for a new setup link. | WhatsApp-only partners can't get an email link; the P1 hotel link still works for them. |
| C39 | Sign-in footer. `p2-copy.ts:138-139` | New here? **Create a partner account** | Goes to /partner/signup. |
| C40 | Forgot page title. `p2-copy.ts:140` | Forgot password | |
| C41 | Forgot page text. `p2-copy.ts:141` | Enter the email of your partner account. We'll send you a link to choose a new password. | The answer after sending reuses the hotel text. |
| C42 | Forgot button. `p2-copy.ts:142-143` | Send link (while busy: "Sending…") | |
| C43 | Reset email subject. `p2-copy.ts:150` | Reset your Abeiku partner password | "partner" so a hotel owner who is also a partner knows which one. |
| C44 | Reset email body. `p2-copy.ts:151-161` | Hello,<br><br>Someone asked to reset the password for your Abeiku partner account. To choose a new password, tap the button below.<br><br>**[Choose a new password]**<br><br>The link works for 1 hour and only once. If you didn't ask for this, you can ignore this email. Your password stays the same.<br><br>If the button doesn't work, copy this link into your browser: {link} | The hotel reset email with "partner account". Using the link also confirms the email. |
| C45 | "Password changed" email subject. `p2-copy.ts:168` | Your Abeiku partner password was changed | |
| C46 | "Password changed" email body. `p2-copy.ts:169-172` | Hello,<br><br>The password for your Abeiku partner account was just changed. You can now sign in with your new password.<br><br>**If this wasn't you**, reply to hello@abeiku.com right away and we'll help you lock your account. | Same as the hotel one. |
| C47 | Reset page title. `p2-copy.ts:178` | Choose a new password | |
| C48 | Reset page labels. `p2-copy.ts:179-180` | New password · Type it again | |
| C49 | Reset button. `p2-copy.ts:181` | Save password | |
| C50 | After saving. `p2-copy.ts:182` | Your password is changed. You can sign in now. | Followed by "Go to sign in". |
| C51 | Reset page footer link. `p2-copy.ts:183` | Ask for a new link | Back to the forgot page. |

## Partner dashboard: no hotels yet

| ID | Where | Draft | Why |
|---|---|---|---|
| C52 | Card title. `p2-copy.ts:188`, `src/app/partner/(gated)/dashboard/page.tsx:117` | No hotels yet | Shown under "Welcome, {name}" to a signed-up account no hotel has added. |
| C53 | Card text. `p2-copy.ts:189-190`, `dashboard/page.tsx:118` | Hotels add their partners on Abeiku. When a hotel adds you with this email, it shows up here with your link and your commission. You can't pick hotels here: talk to the hotels you work with. | Says it plainly and that a hotel adds them (not a marketplace). |

## Hotel admin: recording a payout (Partners page)

The "Record payout" link shows under a partner's Owed amount when something is owed. The form lists the partner's owed bookings, all ticked; the amount fills in as their commission and can be changed.

| ID | Where | Draft | Why |
|---|---|---|---|
| C54 | Link on the partner row. `p2-copy.ts:195`, `InfluencersClient.tsx:387` | Record payout | |
| C55 | Form title. `p2-copy.ts:196`, `InfluencersClient.tsx:462` | Record a payout to {name} | |
| C56 | Form text. `p2-copy.ts:197-198`, `InfluencersClient.tsx:464` | Abeiku doesn't send the money. Pay {name} yourself, for example by bank transfer, then record it here so you both see it. | His decision: no money moves through Abeiku; bank deposit, not MoMo. |
| C57 | Bookings list label. `p2-copy.ts:199` | Bookings this payout covers | |
| C58 | Field labels. `p2-copy.ts:200, 202-204, 206` | Amount paid · Currency · Date paid · How you paid · Reference (optional) | |
| C59 | Placeholders. `p2-copy.ts:205, 207` | Bank transfer · Bank reference | Nudges toward bank transfer. |
| C60 | Note when the amount or currency differs from the ticked commission. `p2-copy.ts:201` | This is different from the commission on the ticked bookings ({total}). | A warning only; saving is allowed (rounding, other currency). |
| C61 | Buttons. `p2-copy.ts:208, 210-211` | Save payout (busy: "Saving…") · Cancel | "Save payout" is the same as P1's per-booking button. |
| C62 | Green notice after saving. `p2-copy.ts:212-213`, `InfluencersClient.tsx:172` | Payout to {name} recorded. {n} booking(s) are now marked paid. | ("1 booking is" / "{n} bookings are") |
| C63 | Save failed. `p2-copy.ts:209` | Could not save the payout. Please try again. | |
| C64 | Error: nothing ticked. `p2-copy.ts:214` | Tick at least one owed booking. | |
| C65 | Error: amount. `p2-copy.ts:215` | Enter the amount you paid. | |
| C66 | Error: how paid. `p2-copy.ts:216` | Enter how you paid, for example bank transfer. | |
| C67 | Error: date (missing, or in the future). `p2-copy.ts:217` | Enter the date you paid. | |
| C68 | Error: a ticked booking is no longer owed (paid in another tab, refunded). `p2-copy.ts:218` | Some of these bookings are no longer owed. Reload the page and try again. | |
| C69 | Error: SQL not run yet. `p2-copy.ts:219` | Recording payouts is not switched on yet. Please try again later. | Only before docs/go-live-p2-signup-payouts.sql runs. |
| C70 | New section at the bottom of the page. `p2-copy.ts:220`, `InfluencersClient.tsx:568` | Payouts | Every payout the hotel recorded, newest first. |
| C71 | Empty section. `p2-copy.ts:221` | No payouts recorded yet | |
| C72 | Columns (admin; partner uses all but Partner). `p2-copy.ts:222-226` | Date · Partner · Amount · How paid · Reference | |

## Partner dashboard: payouts

| ID | Where | Draft | Why |
|---|---|---|---|
| C73 | Section title, under "Your bookings". `p2-copy.ts:231`, `dashboard/page.tsx:232` | Payouts from {hotel} | Per hotel: it follows the hotel switcher, next to Owed / Paid. |
| C74 | Empty section. `p2-copy.ts:232`, `dashboard/page.tsx:234` | No payouts recorded yet. {hotel} records each payout here when they pay you. | Says who records it. |
