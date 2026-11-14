// Ref code generation and contact normalization. Pure, no I/O.

import { normalizeRefCode } from "./commission";

const MAX_CODE = 40;

/**
 * Ref code from a partner name: lowercase, ASCII letters/digits, words joined by "-".
 * "Carmen's Travels" -> "carmen-travels", "Kofi & Ama Tours Ltd." -> "kofi-ama-tours-ltd".
 * Possessive "'s" is dropped. Names with fewer than 2 usable characters fall back to "partner".
 */
export function codeFromName(name: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .toLowerCase()
    .replace(/['’`]s\b/g, "") // possessive 's
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  // Leave room for a "-NN" suffix so de-duplication never exceeds the length limit.
  const trimmed = base.slice(0, MAX_CODE - 4).replace(/-+$/, "");
  return trimmed.length >= 2 ? trimmed : "partner";
}

/** First of code, code-2, code-3, ... not in `taken` (compared lowercase). */
export function dedupeCode(code: string, taken: Iterable<string>): string {
  const used = new Set([...taken].map(normalizeRefCode));
  const base = normalizeRefCode(code);
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) {
    const suffix = `-${n}`;
    const candidate = base.slice(0, MAX_CODE - suffix.length).replace(/-+$/, "") + suffix;
    if (!used.has(candidate)) return candidate;
  }
}

const E164 = /^\+[1-9][0-9]{6,14}$/;

/**
 * WhatsApp number to E.164. Accepts spaces, dashes, dots and brackets, and a "00"
 * international prefix. Returns null if it is not a full international number
 * (local numbers like 024… are rejected: the country code is not guessed).
 */
export function normalizeWhatsapp(raw: string): string | null {
  let s = raw.trim().replace(/[\s\-.()]/g, "");
  if (s.startsWith("00")) s = "+" + s.slice(2);
  return E164.test(s) ? s : null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  return EMAIL.test(s) ? s : null;
}
