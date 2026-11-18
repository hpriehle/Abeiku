// Booking alerts wired to Supabase and Resend. Every function here logs and returns
// instead of throwing, so an alert problem never fails the write that triggered it.

import { sendEmail } from "@/lib/notifications/email";
import { supabaseAlertStore } from "@/lib/db/booking-alerts";
import { getHotelById } from "@/lib/db";
import { hotelStorage } from "@/lib/hotel-context";
import { sendTemplate } from "@/lib/whatsapp/client";
import { pickAlertSender } from "./alert-sender";
import { opsAlert } from "@/lib/ops/alerts";
import {
  alertBookingsNow,
  logSkip,
  runBookingAlerts,
  sendArrivalsDigest,
  silenceBackfill,
  type Mailer,
  type WhatsAppAlerter,
} from "./booking-alerts";

/** L3: a failed alert email also emails Harrison (at most hourly). No guest data in that email. */
export const resendMailer: Mailer = async (msg) => {
  const res = await sendEmail(msg);
  if (!res.success) await opsAlert("alert-send-email", "A booking alert email to a hotel was not sent", res.error ?? "unknown");
  return res;
};

/** Approved Meta template for manager alerts (body: "Booking alert for {{1}}: {{2}}. …"). */
export const BOOKING_ALERT_TEMPLATE = process.env.WHATSAPP_ALERT_TEMPLATE || "booking_alert";
export const BOOKING_ALERT_LANGUAGE = process.env.WHATSAPP_ALERT_TEMPLATE_LANG || "en";

/**
 * Sends a template (works outside the 24h window) from the hotel's own connected number,
 * or, if it has none, from the platform sender hotel (WHATSAPP_ALERT_SENDER_HOTEL_ID).
 * The text always names the alerting hotel.
 */
export const metaWhatsAppAlerter: WhatsAppAlerter = async (msg) => {
  const res = await sendWhatsAppAlert(msg);
  if (!res.success) await opsAlert("alert-send-whatsapp", `A WhatsApp booking alert for ${msg.hotelName} was not sent`, res.error ?? "unknown");
  return res;
};

const sendWhatsAppAlert: WhatsAppAlerter = async ({ hotelId, hotelName, to, summary }) => {
  try {
    const hotel = await getHotelById(hotelId);
    const sender = hotel ? await pickAlertSender(hotel, getHotelById) : null;
    if (!sender) return { success: false, error: "WhatsApp not connected" };
    await hotelStorage.run({ hotelId: sender.id, hotel: sender }, () =>
      sendTemplate(to, { name: BOOKING_ALERT_TEMPLATE, language: BOOKING_ALERT_LANGUAGE, bodyParams: [hotelName, summary] })
    );
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error)?.message ?? String(err) };
  }
};

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
  const counts = await runBookingAlerts({ store: supabaseAlertStore, mailer: resendMailer, whatsapp: metaWhatsAppAlerter, today: todayUtc() });
  return { silencedBackfill, ...counts };
}

/**
 * After a sync of several hotels: keep each feed's first import silent (per hotel), then one
 * sweep. A hotel whose backfill couldn't be marked is left out of the sweep this run.
 */
export async function alertsAfterSyncs(inputs: { hotelId: string; loadedFeeds: string[]; syncedBefore: Set<string> | null }[]) {
  let silencedBackfill = 0;
  const skipHotelIds: string[] = [];
  let skipped: string | undefined;
  for (const input of inputs) {
    try {
      silencedBackfill += await silenceBackfill({
        store: supabaseAlertStore,
        hotelId: input.hotelId,
        loadedFeeds: input.loadedFeeds,
        syncedBefore: input.syncedBefore ?? new Set(),
      });
    } catch (err) {
      skipHotelIds.push(input.hotelId);
      skipped = logSkip("backfill", err);
    }
  }
  const counts = await runBookingAlerts({ store: supabaseAlertStore, mailer: resendMailer, whatsapp: metaWhatsAppAlerter, today: todayUtc(), skipHotelIds });
  return { silencedBackfill, ...counts, ...(skipHotelIds.length ? { backfillFailedHotels: skipHotelIds.length, skipped: counts.skipped ?? skipped } : {}) };
}

/** Right after a known write (website report, admin cancel). */
export async function alertBookingIds(hotelId: string, ids: string[]) {
  return alertBookingsNow({ store: supabaseAlertStore, mailer: resendMailer, whatsapp: metaWhatsAppAlerter, hotelId, ids, today: todayUtc() });
}

export async function arrivalsDigestFor(tomorrow: string) {
  return sendArrivalsDigest({ store: supabaseAlertStore, mailer: resendMailer, tomorrow });
}
