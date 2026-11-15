// Checks a partner setup / reset link. Pure, no I/O.

export type InviteCheck =
  | { valid: true; name: string; reset: boolean }
  | { valid: false; reason: "missing" | "invalid" | "expired"; message: string };

export const INVITE_MESSAGES = {
  missing: "This page needs the full setup link your hotel sent you. Open the link from your message again.",
  invalid: "This setup link has already been used or was replaced by a newer one. Ask your hotel for a new link.",
  expired: "This setup link has expired. Ask your hotel to send you a new one.",
} as const;

export function checkInvite(
  token: string,
  partner: { name: string; password_hash: string | null; invite_expires_at: string | null } | null,
  now: Date = new Date()
): InviteCheck {
  if (!token) return { valid: false, reason: "missing", message: INVITE_MESSAGES.missing };
  if (!partner) return { valid: false, reason: "invalid", message: INVITE_MESSAGES.invalid };
  if (partner.invite_expires_at && new Date(partner.invite_expires_at) < now) {
    return { valid: false, reason: "expired", message: INVITE_MESSAGES.expired };
  }
  return { valid: true, name: partner.name, reset: Boolean(partner.password_hash) };
}
