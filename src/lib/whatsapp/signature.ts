// Meta signs every webhook POST with the app secret:
//   X-Hub-Signature-256: sha256=<hex HMAC-SHA256 of the raw body>
// The check fails closed: no secret configured means every POST is refused,
// so a misconfigured deploy can't accept forged messages.

import { createHmac, timingSafeEqual } from "crypto";

export type SignatureResult = "ok" | "missing-secret" | "missing-header" | "mismatch";

export function checkWebhookSignature(
  rawBody: string,
  header: string | null | undefined,
  secret: string | undefined,
): SignatureResult {
  if (!secret) return "missing-secret";
  if (!header || !header.startsWith("sha256=")) return "missing-header";
  const hex = header.slice("sha256=".length).trim();
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) return "mismatch";
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest();
  const given = Buffer.from(hex, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected) ? "ok" : "mismatch";
}

/** Header value Meta would send for this body (used by tests and local replay scripts). */
export function signBody(rawBody: string, secret: string): string {
  return "sha256=" + createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
}
