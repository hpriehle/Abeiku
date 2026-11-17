// P2 partner-accounts text that partners or hotels see. DRAFT, held for Harrison's review:
// every string here has an entry (C1, C2, ...) in docs/p2-copy.md. Change the doc and this file
// together.

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export interface AddedNoticeInput {
  partnerName: string;
  hotelName: string;
  /** Partner link on the hotel site; null if the hotel has no site set up. */
  link: string | null;
  loginUrl: string;
}

/** C1-C2: email to a partner whose existing account a hotel just added. */
export function addedEmail(i: AddedNoticeInput): { subject: string; html: string; text: string } {
  const subject = `${i.hotelName} added you as a partner`;
  const lines = [
    `Hi ${i.partnerName},`,
    `${i.hotelName} added you as a partner on Abeiku. You can see it now in your partner account.`,
    ...(i.link ? [`Your link for ${i.hotelName}: ${i.link}`] : []),
    `Log in with your usual password: ${i.loginUrl}`,
  ];
  const html = [
    `<p>Hi ${escapeHtml(i.partnerName)},</p>`,
    `<p>${escapeHtml(i.hotelName)} added you as a partner on Abeiku. You can see it now in your partner account.</p>`,
    ...(i.link ? [`<p>Your link for ${escapeHtml(i.hotelName)}:<br><a href="${escapeHtml(i.link)}">${escapeHtml(i.link)}</a></p>`] : []),
    `<p><a href="${escapeHtml(i.loginUrl)}">Log in</a> with your usual password.</p>`,
  ].join("\n");
  return { subject, html, text: lines.join("\n\n") };
}

/** C3: WhatsApp text the hotel sends with one tap (wa.me link), same idea as the P1 setup link. */
export function addedWhatsappText(i: AddedNoticeInput): string {
  return [
    `Hi ${i.partnerName}, ${i.hotelName} added you as a partner on Abeiku.`,
    ...(i.link ? [`Your link: ${i.link}`] : []),
    `Log in with your usual password: ${i.loginUrl}`,
  ].join("\n");
}

/** wa.me tap link: opens WhatsApp on the hotel's phone with the text filled in. Sends nothing. */
export function whatsappTapUrl(whatsapp: string, text: string): string {
  return `https://wa.me/${whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}

/** C4: admin tries to add a partner who is already one of theirs. */
export const ALREADY_YOUR_PARTNER = "This partner is already on your list.";

/** C5-C8: admin notice after adding an existing partner. */
export const ADMIN_ADDED = {
  title: (name: string, code: string) => `${name} already has an Abeiku partner account. They are now your partner, code ${code}.`,
  emailed: "We emailed them to say so.",
  notEmailed: "We could not email them. Send them a WhatsApp instead.",
  whatsappButton: "Send on WhatsApp",
} as const;

/** C9-C10: setup link opened by someone whose email already has an account with a password. */
export const HAS_ACCOUNT = {
  title: "You already have an account",
  message: "You already have an Abeiku partner account with this email. This hotel is now in it. Log in with your password.",
} as const;

/** C11-C13: partner dashboard. */
export const DASHBOARD = {
  hotelLabel: "Hotel",
  clicksLabel: "Clicks",
  clicksHint: "Times your link was opened",
} as const;

// ── P2 steps 2 and 5: sign-up, email check, forgot password, payouts (C14+). DRAFT, held for
// Harrison's review like the rest of this file; see the matching section of docs/p2-copy.md.

const APP = () => (process.env.NEXT_PUBLIC_APP_URL ?? "https://abeiku.com").trim().replace(/\/$/, "");

/** C14-C26: sign-up page (/partner/signup) and its API errors. */
export const SIGNUP = {
  title: "Become a partner",
  subtitle: "Earn commission when guests book a hotel through your link",
  howItWorks: "Hotels add their own partners. Once a hotel adds you, it shows up in your account.",
  nameLabel: "Your name",
  emailLabel: "Email",
  whatsappLabel: "WhatsApp number",
  whatsappPlaceholder: "+233 24 123 4567",
  passwordLabel: "Password",
  passwordHint: "At least 8 characters",
  button: "Create account",
  buttonBusy: "Creating account…",
  haveAccount: "Already have an account?",
  signIn: "Sign in",
  checkEmailTitle: "Check your email",
  checkEmail: (email: string) =>
    `We sent a link to ${email}. Open it to confirm your email, then you can sign in. The link works for 48 hours.`,
  errName: "Enter your name.",
  errEmail: "Enter a valid email address.",
  errWhatsapp: "Enter your WhatsApp number with the country code, for example +233 24 123 4567.",
  errEmailTaken: "An account with this email already exists. Sign in, or reset your password if you forgot it.",
  errNotReady: "Sign-up is not open yet. Please try again later.",
} as const;

/** C27-C28: email with the confirm link. */
export function confirmEmail(name: string, token: string) {
  const link = `${APP()}/partner/confirm?token=${encodeURIComponent(token)}`;
  const subject = "Confirm your email for Abeiku";
  const text = [
    `Hi ${name},`,
    `Thanks for creating an Abeiku partner account. To confirm this is your email, open this link:`,
    link,
    `The link works for 48 hours and only once. If you didn't sign up, you can ignore this email.`,
  ].join("\n\n");
  const html = `<p style="margin:0 0 16px;color:#222;font-size:15px;">Hi ${escapeHtml(name)},</p>
<p style="margin:0 0 16px;color:#222;font-size:15px;">Thanks for creating an Abeiku partner account. To confirm this is your email, tap the button below.</p>
<p style="margin:0 0 24px;"><a href="${link}" style="display:inline-block;background:#2D4A3E;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:15px;">Confirm my email</a></p>
<p style="margin:0 0 16px;color:#555;font-size:13px;">The link works for 48 hours and only once. If you didn't sign up, you can ignore this email.</p>
<p style="margin:0;color:#888;font-size:12px;word-break:break-all;">If the button doesn't work, copy this link into your browser:<br>${link}</p>`;
  return { subject, html, text };
}

/** C29-C36: confirm page (/partner/confirm) and the unconfirmed sign-in. */
export const CONFIRM = {
  title: "Confirm your email",
  busy: "Confirming your email…",
  invalid: "This link isn't valid. Sign in and we'll offer to send a new one.",
  used: "This link has already been used. If your email is confirmed, just sign in.",
  expired: "This link has expired. Sign in and we'll offer to send a new one.",
  /** Sign-in refused: right password, email not confirmed yet. */
  loginUnconfirmed: "Confirm your email first. We sent you a link when you signed up.",
  resendButton: "Send the link again",
  resent: "If your email still needs confirming, we've sent a new link. Check your inbox (and spam folder).",
} as const;

/** C37-C42: sign-in page footer and forgot-password page (/partner/forgot-password). */
export const FORGOT = {
  loginLink: "Forgot your password?",
  noEmailHint: "No email on your account? Ask your hotel for a new setup link.",
  newHere: "New here?",
  createAccount: "Create a partner account",
  title: "Forgot password",
  intro: "Enter the email of your partner account. We'll send you a link to choose a new password.",
  button: "Send link",
  buttonBusy: "Sending…",
  // The answer itself reuses the hotel text SENT_MESSAGE (src/lib/auth/password-reset.ts).
} as const;

/** C43-C44: reset email. */
export function partnerResetEmail(token: string) {
  const link = `${APP()}/partner/reset-password?token=${encodeURIComponent(token)}`;
  const subject = "Reset your Abeiku partner password";
  const text = [
    "Hello,",
    "Someone asked to reset the password for your Abeiku partner account. To choose a new password, open this link:",
    link,
    "The link works for 1 hour and only once. If you didn't ask for this, you can ignore this email. Your password stays the same.",
  ].join("\n\n");
  const html = `<p style="margin:0 0 16px;color:#222;font-size:15px;">Hello,</p>
<p style="margin:0 0 16px;color:#222;font-size:15px;">Someone asked to reset the password for your Abeiku partner account. To choose a new password, tap the button below.</p>
<p style="margin:0 0 24px;"><a href="${link}" style="display:inline-block;background:#2D4A3E;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:15px;">Choose a new password</a></p>
<p style="margin:0 0 16px;color:#555;font-size:13px;">The link works for 1 hour and only once. If you didn't ask for this, you can ignore this email. Your password stays the same.</p>
<p style="margin:0;color:#888;font-size:12px;word-break:break-all;">If the button doesn't work, copy this link into your browser:<br>${link}</p>`;
  return { subject, html, text };
}

/** C45-C46: "password changed" email. */
export function partnerPasswordChangedEmail() {
  const login = `${APP()}/partner/login`;
  const subject = "Your Abeiku partner password was changed";
  const text = `Hello,\n\nThe password for your Abeiku partner account was just changed. You can now sign in with your new password: ${login}\n\nIf this wasn't you, reply to hello@abeiku.com right away and we'll help you lock your account.`;
  const html = `<p style="margin:0 0 16px;color:#222;font-size:15px;">Hello,</p>
<p style="margin:0 0 16px;color:#222;font-size:15px;">The password for your Abeiku partner account was just changed. You can now <a href="${login}" style="color:#2D4A3E;">sign in</a> with your new password.</p>
<p style="margin:0;color:#222;font-size:15px;"><strong>If this wasn't you</strong>, reply to <a href="mailto:hello@abeiku.com" style="color:#2D4A3E;">hello@abeiku.com</a> right away and we'll help you lock your account.</p>`;
  return { subject, html, text };
}

/** C47-C51: reset page (/partner/reset-password). Link and password errors reuse the hotel texts. */
export const RESET = {
  title: "Choose a new password",
  newLabel: "New password",
  againLabel: "Type it again",
  button: "Save password",
  done: "Your password is changed. You can sign in now.",
  newLink: "Ask for a new link",
} as const;

/** C52-C53: dashboard of an account no hotel has added yet. */
export const NO_HOTELS = {
  title: "No hotels yet",
  message:
    "Hotels add their partners on Abeiku. When a hotel adds you with this email, it shows up here with your link and your commission. You can't pick hotels here: talk to the hotels you work with.",
} as const;

/** C54-C72: hotel admin, recording a payout (Partners page). */
export const PAYOUT_ADMIN = {
  recordButton: "Record payout",
  formTitle: (name: string) => `Record a payout to ${name}`,
  intro: (name: string) =>
    `Abeiku doesn't send the money. Pay ${name} yourself, for example by bank transfer, then record it here so you both see it.`,
  bookingsLabel: "Bookings this payout covers",
  amountLabel: "Amount paid",
  amountDiffers: (total: string) => `This is different from the commission on the ticked bookings (${total}).`,
  currencyLabel: "Currency",
  dateLabel: "Date paid",
  methodLabel: "How you paid",
  methodPlaceholder: "Bank transfer",
  referenceLabel: "Reference (optional)",
  referencePlaceholder: "Bank reference",
  save: "Save payout",
  saveFailed: "Could not save the payout. Please try again.",
  saving: "Saving…",
  cancel: "Cancel",
  saved: (name: string, n: number) =>
    `Payout to ${name} recorded. ${n === 1 ? "1 booking is" : `${n} bookings are`} now marked paid.`,
  errBookings: "Tick at least one owed booking.",
  errAmount: "Enter the amount you paid.",
  errMethod: "Enter how you paid, for example bank transfer.",
  errDate: "Enter the date you paid.",
  errNotOwed: "Some of these bookings are no longer owed. Reload the page and try again.",
  errNotReady: "Recording payouts is not switched on yet. Please try again later.",
  historyTitle: "Payouts",
  historyEmpty: "No payouts recorded yet",
  colDate: "Date",
  colPartner: "Partner",
  colAmount: "Amount",
  colMethod: "How paid",
  colReference: "Reference",
} as const;

/** C73-C74: partner dashboard, payout history of the hotel shown. */
export const PAYOUT_PARTNER = {
  title: (hotel: string) => `Payouts from ${hotel}`,
  empty: (hotel: string) => `No payouts recorded yet. ${hotel} records each payout here when they pay you.`,
  // Columns reuse C72 (Date, Amount, How paid, Reference).
} as const;
