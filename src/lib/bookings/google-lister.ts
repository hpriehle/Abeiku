// Reads other hotels' Google calendars with the same service account C1 uses for Aracuya
// (GOOGLE_SERVICE_ACCOUNT_EMAIL / _PRIVATE_KEY). A hotel makes its calendar readable by
// sharing it with that email ("See all event details").

import { listGoogleEvents } from "./feeds";
import type { GoogleEventLike } from "./calendar-sync";

export const GOOGLE_TIMEOUT_MS = 8_000;

/** The email hotels share their calendar with; null when the service account isn't set. */
export function serviceAccountEmail(env: NodeJS.ProcessEnv = process.env): string | null {
  return env.GOOGLE_SERVICE_ACCOUNT_EMAIL && env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ? env.GOOGLE_SERVICE_ACCOUNT_EMAIL : null;
}

export function googleListerFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  opts: { onePage?: boolean } = {}
): ((calendarId: string, today: string) => Promise<GoogleEventLike[]>) | null {
  const email = serviceAccountEmail(env);
  const key = env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !key) return null;
  return (calendarId, today) =>
    listGoogleEvents({ email, key, calendarId }, today, {
      timeoutMs: GOOGLE_TIMEOUT_MS,
      ...(opts.onePage ? { onePage: true, maxResults: 1 } : {}),
    });
}
