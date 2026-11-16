// Supabase store for imported hotel bookings (website reports + calendar sync).
// Needs supabase-migration-booking-sources.sql.

import { supabase } from "@/lib/supabase/client";
import type {
  HotelBookingPatch,
  HotelBookingRow,
  HotelBookingsStore,
  NewHotelBooking,
} from "@/lib/bookings/hotel-bookings";

// "*" so feed_id (docs/l2-feeds/calendar-feeds.sql) comes back once it exists, and nothing
// fails before it does.
const COLUMNS = "*";

const ON_CONFLICT = "hotel_id,source,external_ref";

function toRow(r: Record<string, unknown>): HotelBookingRow {
  return { ...(r as unknown as HotelBookingRow), total_price: Number(r.total_price ?? 0) };
}

export const supabaseHotelBookingsStore: HotelBookingsStore = {
  async find(hotelId, source, externalRef) {
    const { data, error } = await supabase
      .from("bookings")
      .select(COLUMNS)
      .eq("hotel_id", hotelId)
      .eq("source", source)
      .eq("external_ref", externalRef)
      .maybeSingle();
    if (error) throw error;
    return data ? toRow(data as unknown as Record<string, unknown>) : null;
  },

  async listBySources(hotelId, sources) {
    const rows: HotelBookingRow[] = [];
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from("bookings")
        .select(COLUMNS)
        .eq("hotel_id", hotelId)
        .in("source", sources)
        .order("id")
        .range(from, from + PAGE - 1);
      if (error) throw error;
      rows.push(...((data ?? []) as unknown as Record<string, unknown>[]).map(toRow));
      if (!data || data.length < PAGE) return rows;
    }
  },

  async insert(row: NewHotelBooking) {
    const { data, error } = await supabase
      .from("bookings")
      .upsert(row, { onConflict: ON_CONFLICT, ignoreDuplicates: true })
      .select(COLUMNS);
    if (error) throw error;
    const inserted = (data ?? [])[0] as unknown as Record<string, unknown> | undefined;
    return inserted ? toRow(inserted) : null;
  },

  async update(id, patch: HotelBookingPatch) {
    const { error } = await supabase
      .from("bookings")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  },
};
