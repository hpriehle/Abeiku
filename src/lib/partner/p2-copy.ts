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
