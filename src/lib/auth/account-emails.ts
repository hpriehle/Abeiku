// Emails for confirming a hotel admin's login email (sign-up and change of email), and the notice
// to the old address after a change. Sent with sendEmail (Resend). Customers see "Abeiku"; the
// small print names the operator.

import { appUrl } from "./password-reset-emails";
import { CONTACT_EMAIL, LEGAL_ENTITY } from "@/lib/site";

const SMALL_PRINT = `Abeiku, operated by ${LEGAL_ENTITY}`;

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function confirmLink(token: string, env: NodeJS.ProcessEnv = process.env): string {
  return `${appUrl(env)}/confirm-email?token=${encodeURIComponent(token)}`;
}

function linkEmail(opts: { subject: string; intro: string; button: string; outro: string; link: string }) {
  return {
    subject: opts.subject,
    html: `<p style="margin:0 0 16px;color:#222;font-size:15px;">Hello,</p>
<p style="margin:0 0 16px;color:#222;font-size:15px;">${escapeHtml(opts.intro)}</p>
<p style="margin:0 0 24px;"><a href="${opts.link}" style="display:inline-block;background:#2D4A3E;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:15px;">${escapeHtml(opts.button)}</a></p>
<p style="margin:0 0 16px;color:#555;font-size:13px;">${escapeHtml(opts.outro)}</p>
<p style="margin:0 0 16px;color:#888;font-size:12px;word-break:break-all;">If the button doesn't work, copy this link into your browser:<br>${opts.link}</p>
<p style="margin:0;color:#aaa;font-size:11px;">${SMALL_PRINT}</p>`,
    text: `Hello,

${opts.intro} Open this link:

${opts.link}

${opts.outro}

${SMALL_PRINT}`,
  };
}

/** Sent at sign-up (and on "Resend"): confirms the login email. */
export function verifyEmailMessage(token: string, env: NodeJS.ProcessEnv = process.env) {
  return linkEmail({
    subject: "Confirm your email for Abeiku",
    intro: "Thanks for signing up for Abeiku. Please confirm this is your email, so we can reach you about your account and bookings.",
    button: "Confirm my email",
    outro: "The link works for 24 hours. If you didn't sign up for Abeiku, you can ignore this email.",
    link: confirmLink(token, env),
  });
}

/** Sent to the new address when an admin asks to change their login email. */
export function changeEmailMessage(token: string, env: NodeJS.ProcessEnv = process.env) {
  return linkEmail({
    subject: "Confirm your new email for Abeiku",
    intro: "You asked to use this email to sign in to your Abeiku hotel dashboard. Please confirm it.",
    button: "Use this email",
    outro: "Your login email changes only after you open this link. It works for 24 hours. If you didn't ask for this, ignore this email and nothing changes.",
    link: confirmLink(token, env),
  });
}

/** Sent to the old address after the login email was switched. */
export function emailChangedNotice(newEmail: string) {
  const safe = escapeHtml(newEmail);
  return {
    subject: "Your Abeiku login email was changed",
    html: `<p style="margin:0 0 16px;color:#222;font-size:15px;">Hello,</p>
<p style="margin:0 0 16px;color:#222;font-size:15px;">The login email for your Abeiku hotel dashboard was changed to <strong>${safe}</strong>. From now on, sign in with that address.</p>
<p style="margin:0 0 16px;color:#222;font-size:15px;"><strong>If this wasn't you</strong>, reply to <a href="mailto:${CONTACT_EMAIL}" style="color:#2D4A3E;">${CONTACT_EMAIL}</a> right away and we'll help you get your account back.</p>
<p style="margin:0;color:#aaa;font-size:11px;">${SMALL_PRINT}</p>`,
    text: `Hello,

The login email for your Abeiku hotel dashboard was changed to ${newEmail}. From now on, sign in with that address.

If this wasn't you, reply to ${CONTACT_EMAIL} right away and we'll help you get your account back.

${SMALL_PRINT}`,
  };
}
