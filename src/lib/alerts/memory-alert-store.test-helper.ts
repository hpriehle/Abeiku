// In-memory AlertStore for tests. It reads and writes the same row map as
// memoryHotelBookings (src/lib/bookings/memory-store.test-helper.ts), so the real
// calendar sync and the alerts can run against one table.

import { toCalendarRow } from "@/lib/bookings/calendar-view";
import type { AlertField, AlertHotel, AlertStore } from "./booking-alerts";

type Row = Record<string, unknown> & { id: string; hotel_id: string };

export function memoryAlertStore(
  rows: Map<string, Row> | Map<string, unknown>,
  opts: { hotels?: AlertHotel[]; missingSchema?: boolean } = {}
) {
  const table = rows as Map<string, Row>;
  const hotels = opts.hotels ?? [];
  const feeds = new Set<string>();
  const digests = new Set<string>();
  let clock = 0;
  const now = () => `2026-11-15T18:00:${String(clock++ % 60).padStart(2, "0")}Z`;
  const guard = () => {
    if (opts.missingSchema) throw { code: "42703", message: "column hotels.alert_email does not exist" };
  };
  const view = (r: Row) => ({
    ...toCalendarRow(r),
    calendar_event_id: (r.calendar_event_id as string | null) ?? null,
    alert_new_sent_at: (r.alert_new_sent_at as string | null) ?? null,
    alert_cancel_sent_at: (r.alert_cancel_sent_at as string | null) ?? null,
  });
  const of = (hotelId: string) => [...table.values()].filter((r) => r.hotel_id === hotelId);

  const store: AlertStore = {
    async listAlertHotels() {
      guard();
      return hotels.map((h) => ({ ...h }));
    },
    async listPendingNew(hotelId) {
      guard();
      return of(hotelId).filter((r) => !r.alert_new_sent_at).map(view);
    },
    async listPendingCancel(hotelId, today) {
      guard();
      return of(hotelId)
        .filter((r) => r.booking_status === "cancelled" && !r.alert_cancel_sent_at && String(r.check_out) >= today)
        .map(view);
    },
    async getRows(hotelId, ids) {
      guard();
      return of(hotelId).filter((r) => ids.includes(r.id)).map(view);
    },
    async listByCheckIn(hotelId, from, to) {
      guard();
      return of(hotelId)
        .filter((r) => r.booking_status !== "cancelled" && String(r.check_in) >= from && String(r.check_in) <= to)
        .map(toCalendarRow);
    },
    async claim(ids: string[], field: AlertField) {
      guard();
      const got: string[] = [];
      for (const id of ids) {
        const r = table.get(id);
        if (r && !r[field]) {
          r[field] = now();
          got.push(id);
        }
      }
      return got;
    },
    async release(ids: string[], field: AlertField) {
      for (const id of ids) {
        const r = table.get(id);
        if (r) r[field] = null;
      }
    },
    async syncedFeeds(hotelId) {
      guard();
      return new Set([...feeds].filter((k) => k.startsWith(`${hotelId}|`)).map((k) => k.split("|")[1]));
    },
    async markFeedsSynced(hotelId, list) {
      guard();
      for (const f of list) feeds.add(`${hotelId}|${f}`);
    },
    async claimDigest(hotelId, kind, forDate) {
      guard();
      const k = `${hotelId}|${kind}|${forDate}`;
      if (digests.has(k)) return false;
      digests.add(k);
      return true;
    },
    async releaseDigest(hotelId, kind, forDate) {
      digests.delete(`${hotelId}|${kind}|${forDate}`);
    },
  };
  return { store, feeds, digests };
}
