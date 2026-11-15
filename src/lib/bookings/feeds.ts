// Reads Aracuya's booking feeds (read-only): its Google booking calendar via a service
// account, and the OTA iCal export links. Env (same names as on aracuya.com):
//   GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY (PEM; literal "\n" OK)
//   GOOGLE_BOOKING_CALENDAR_ID
//   BLOCKING_ICAL_URLS  comma/space-separated Airbnb, VRBO, Booking.com export links
// The URLs carry private tokens: only their host is ever logged.

import { google, type calendar_v3 } from "googleapis";
import {
  addDays,
  googleEventToBooking,
  icalSourceForUrl,
  parseIcalBookings,
  type FeedResult,
} from "./calendar-sync";

/** Hotel whose feeds the env vars above describe. */
export const SYNC_HOTEL_SLUG = "aracuya";

export interface FeedConfig {
  google: { email: string; key: string; calendarId: string } | null;
  icalUrls: string[];
}

export function feedConfigFromEnv(env: NodeJS.ProcessEnv = process.env): FeedConfig {
  const email = env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const calendarId = env.GOOGLE_BOOKING_CALENDAR_ID;
  return {
    google: email && key && calendarId ? { email, key, calendarId } : null,
    icalUrls: (env.BLOCKING_ICAL_URLS ?? "").split(/[\s,]+/).filter((u) => u.startsWith("http")),
  };
}

const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return "invalid-url";
  }
};

async function listGoogleEvents(
  cfg: NonNullable<FeedConfig["google"]>,
  today: string
): Promise<calendar_v3.Schema$Event[]> {
  const auth = new google.auth.JWT({
    email: cfg.email,
    key: cfg.key,
    scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
  });
  const calendar = google.calendar({ version: "v3", auth });
  const events: calendar_v3.Schema$Event[] = [];
  let pageToken: string | undefined;
  do {
    const res = await calendar.events.list({
      calendarId: cfg.calendarId,
      // From a month back (stays in progress, late edits) to three years ahead.
      timeMin: `${addDays(today, -31)}T00:00:00Z`,
      timeMax: `${addDays(today, 3 * 366)}T00:00:00Z`,
      singleEvents: true,
      showDeleted: false,
      maxResults: 2500,
      pageToken,
    });
    events.push(...(res.data.items ?? []));
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return events;
}

/** Read every feed; a feed that fails comes back with bookings: null (and an error line). */
export async function readFeeds(
  cfg: FeedConfig,
  totalRooms: number,
  today: string
): Promise<{ feeds: FeedResult[]; errors: string[] }> {
  const errors: string[] = [];
  const tasks: Promise<FeedResult>[] = [];

  if (cfg.google) {
    tasks.push(
      listGoogleEvents(cfg.google, today)
        .then((events) => ({
          source: "google_calendar" as const,
          bookings: events.map((e) => googleEventToBooking(e, totalRooms)).filter((b) => b !== null),
        }))
        .catch((err) => {
          errors.push(`google_calendar: ${(err as Error).message?.slice(0, 200)}`);
          return { source: "google_calendar" as const, bookings: null };
        })
    );
  } else {
    errors.push("google_calendar: not configured");
  }

  for (const url of cfg.icalUrls) {
    const source = icalSourceForUrl(url);
    if (!source) {
      errors.push(`ical ${hostOf(url)}: unknown OTA host, skipped`);
      continue;
    }
    tasks.push(
      fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15_000) })
        .then(async (res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const text = await res.text();
          if (!text.includes("BEGIN:VCALENDAR")) throw new Error("not an iCal feed");
          return { source, bookings: parseIcalBookings(text, source, totalRooms) };
        })
        .catch((err) => {
          errors.push(`${source} (${hostOf(url)}): ${(err as Error).message?.slice(0, 200)}`);
          return { source, bookings: null };
        })
    );
  }

  return { feeds: await Promise.all(tasks), errors };
}
