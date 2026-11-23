// Supabase store for booking alerts (src/lib/alerts/booking-alerts.ts).
// Needs docs/c2-alerts/booking-alerts.sql; before it runs, queries fail with a
// missing-column error that the alert code logs and skips.

import { supabase } from "@/lib/supabase/client";
import { toCalendarRow } from "@/lib/bookings/calendar-view";
import { listingFor } from "@/lib/bookings/hotel-bookings";
import type { AlertField, AlertStore } from "@/lib/alerts/booking-alerts";
import { alertSenderHotelId, hasOwnWhatsApp } from "@/lib/alerts/alert-sender";
import { logAlertDeliveries } from "@/lib/alerts/delivery-log";

const MAX_PENDING = 500;
const PAGE = 1000;
/** Ids per `id IN (…)` request (keeps the URL short). */
const ID_CHUNK = 100;

function chunks<T>(xs: T[], size = ID_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

function isMissingAlertWhatsApp(err: { code?: string; message?: string }): boolean {
  return /alert_whatsapp|suspended_at/.test(err.message ?? "") && /does not exist|could not find|schema cache/i.test(err.message ?? "");
}

/**
 * True when WHATSAPP_ALERT_SENDER_HOTEL_ID names a hotel with its own connected number,
 * so hotels without one can send alerts from it. A lookup error only turns the fallback
 * off (logged), never the email alerts.
 */
export async function alertSenderReady(senderId: string | null = alertSenderHotelId()): Promise<boolean> {
  if (!senderId) return false;
  const { data, error } = await supabase
    .from("hotels")
    .select("whatsapp_access_token, whatsapp_phone_number_id")
    .eq("id", senderId)
    .maybeSingle();
  if (error) {
    console.error("[booking-alerts] alert sender lookup failed:", error.message);
    return false;
  }
  return hasOwnWhatsApp(data);
}

function withAlerts(r: Record<string, unknown>) {
  return {
    ...toCalendarRow(r),
    alert_new_sent_at: (r.alert_new_sent_at as string | null) ?? null,
    alert_cancel_sent_at: (r.alert_cancel_sent_at as string | null) ?? null,
    calendar_event_id: (r.calendar_event_id as string | null) ?? null,
    feed_id: (r.feed_id as string | null) ?? null,
  };
}

export const supabaseAlertStore: AlertStore = {
  async listAlertHotels() {
    // alert_whatsapp comes from docs/go-live-whatsapp.sql. Until that runs, fall back to
    // the columns email alerts need, so a missing WhatsApp column never stops the emails.
    const base = "id, name, slug, alert_email, whatsapp_access_token, whatsapp_phone_number_id";
    const query = (cols: string) =>
      supabase.from("hotels").select(cols).eq("active", true).not("alert_email", "is", null);
    // suspended_at comes from docs/go-live-platform-actions.sql and falls back the same way.
    let { data, error } = await query(`${base}, alert_whatsapp, suspended_at`);
    if (error && isMissingAlertWhatsApp(error)) ({ data, error } = await query(`${base}, alert_whatsapp`));
    if (error && isMissingAlertWhatsApp(error)) ({ data, error } = await query(base));
    if (error) throw error;
    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    const senderReady = await alertSenderReady();
    return rows
      .filter((h) => typeof h.alert_email === "string" && h.alert_email.includes("@"))
      .map((h) => ({
        id: h.id as string,
        name: h.name as string,
        slug: h.slug as string,
        alert_email: (h.alert_email as string).trim(),
        totalRooms: listingFor(h.slug as string).totalRooms,
        alert_whatsapp: typeof h.alert_whatsapp === "string" && h.alert_whatsapp.trim() ? h.alert_whatsapp.trim() : null,
        // Can send WhatsApp alerts: from its own number, or from the platform sender's.
        whatsappConnected: hasOwnWhatsApp(h) || senderReady,
        suspended: !!h.suspended_at,
      }));
  },

  // Every pending row (paged): a feed's first sync may bring in hundreds, and all must be silenced.
  async listPendingNew(hotelId) {
    const out: ReturnType<typeof withAlerts>[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from("bookings")
        .select("*")
        .eq("hotel_id", hotelId)
        .is("alert_new_sent_at", null)
        .order("id")
        .range(from, from + PAGE - 1);
      if (error) throw error;
      out.push(...(data ?? []).map(withAlerts));
      if (!data || data.length < PAGE) return out;
    }
  },

  async listPendingCancel(hotelId, today) {
    const { data, error } = await supabase
      .from("bookings")
      .select("*")
      .eq("hotel_id", hotelId)
      .eq("booking_status", "cancelled")
      .is("alert_cancel_sent_at", null)
      .gte("check_out", today)
      .order("check_in")
      .limit(MAX_PENDING);
    if (error) throw error;
    return (data ?? []).map(withAlerts);
  },

  async getRows(hotelId, ids) {
    const rows: Record<string, unknown>[] = [];
    for (const part of chunks(ids)) {
      const { data, error } = await supabase.from("bookings").select("*").eq("hotel_id", hotelId).in("id", part);
      if (error) throw error;
      rows.push(...(data ?? []));
    }
    // select("*") doesn't fail on a missing column, so check for it here.
    for (const r of rows) {
      if (!("alert_new_sent_at" in r)) throw { code: "42703", message: "column bookings.alert_new_sent_at does not exist" };
    }
    return rows.map(withAlerts);
  },

  async listByCheckIn(hotelId, from, to) {
    const { data, error } = await supabase
      .from("bookings")
      .select("*")
      .eq("hotel_id", hotelId)
      .neq("booking_status", "cancelled")
      .gte("check_in", from)
      .lte("check_in", to)
      .order("check_in");
    if (error) throw error;
    return (data ?? []).map(toCalendarRow);
  },

  // UPDATE … WHERE field IS NULL RETURNING id: only one caller can claim a row.
  async claim(ids: string[], field: AlertField) {
    const got: string[] = [];
    const at = new Date().toISOString();
    for (const part of chunks(ids)) {
      const { data, error } = await supabase.from("bookings").update({ [field]: at }).in("id", part).is(field, null).select("id");
      if (error) throw error;
      got.push(...(data ?? []).map((r) => r.id as string));
    }
    return got;
  },

  async release(ids: string[], field: AlertField) {
    for (const part of chunks(ids)) {
      const { error } = await supabase.from("bookings").update({ [field]: null }).in("id", part);
      if (error) throw error;
    }
  },

  async syncedFeeds(hotelId) {
    const { data, error } = await supabase.from("booking_alert_feeds").select("feed").eq("hotel_id", hotelId);
    if (error) throw error;
    return new Set((data ?? []).map((r) => r.feed as string));
  },

  async markFeedsSynced(hotelId, feeds) {
    if (!feeds.length) return;
    const { error } = await supabase
      .from("booking_alert_feeds")
      .upsert(
        feeds.map((feed) => ({ hotel_id: hotelId, feed })),
        { onConflict: "hotel_id,feed", ignoreDuplicates: true }
      );
    if (error) throw error;
  },

  async claimDigest(hotelId, kind, forDate) {
    const { error } = await supabase.from("booking_alert_digests").insert({ hotel_id: hotelId, kind, for_date: forDate });
    if (!error) return true;
    if (error.code === "23505") return false; // already sent for this date
    throw error;
  },

  async releaseDigest(hotelId, kind, forDate) {
    const { error } = await supabase
      .from("booking_alert_digests")
      .delete()
      .eq("hotel_id", hotelId)
      .eq("kind", kind)
      .eq("for_date", forDate);
    if (error) throw error;
  },

  logDeliveries: logAlertDeliveries,
};
