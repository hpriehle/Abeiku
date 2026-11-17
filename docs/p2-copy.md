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
