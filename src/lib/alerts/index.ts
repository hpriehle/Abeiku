// Booking alerts wired to Supabase and Resend. Every function here logs and returns
// instead of throwing, so an alert problem never fails the write that triggered it.

import { sendEmail } from "@/lib/notifications/email";
import { supabaseAlertStore } from "@/lib/db/booking-alerts";
import {
  alertBookingsNow,
  logSkip,
  runBookingAlerts,
  sendArrivalsDigest,
  silenceBackfill,
  type Mailer,
} from "./booking-alerts";

export const resendMailer: Mailer = (msg) => sendEmail(msg);

const todayUtc = () => new Date().toISOString().slice(0, 10);

/** Feeds that synced before (null if the alert tables are missing: then treat every feed as new). */
export async function syncedFeedsBefore(hotelId: string): Promise<Set<string> | null> {
  try {
    return await supabaseAlertStore.syncedFeeds(hotelId);
  } catch (err) {
    logSkip("synced feeds", err);
    return null;
  }
}

/** After /api/cron/booking-sync: keep each feed's first import silent, then send what's pending. */
export async function alertsAfterSync(input: {
  hotelId: string;
  loadedFeeds: string[];
  syncedBefore: Set<string> | null;
}) {
  let silencedBackfill = 0;
  try {
    silencedBackfill = await silenceBackfill({
      store: supabaseAlertStore,
      hotelId: input.hotelId,
      loadedFeeds: input.loadedFeeds,
      syncedBefore: input.syncedBefore ?? new Set(),
    });
  } catch (err) {
    // Couldn't mark the backfill: don't sweep, or the backfill would be emailed.
    return { silencedBackfill: 0, skipped: logSkip("backfill", err) };
  }
  const counts = await runBookingAlerts({ store: supabaseAlertStore, mailer: resendMailer, today: todayUtc() });
  return { silencedBackfill, ...counts };
}

/** Right after a known write (website report, admin cancel). */
export async function alertBookingIds(hotelId: string, ids: string[]) {
  return alertBookingsNow({ store: supabaseAlertStore, mailer: resendMailer, hotelId, ids, today: todayUtc() });
}

export async function arrivalsDigestFor(tomorrow: string) {
  return sendArrivalsDigest({ store: supabaseAlertStore, mailer: resendMailer, tomorrow });
}
