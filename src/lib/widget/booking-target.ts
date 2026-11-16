// Where the public widget's "Book" button sends a guest (F2 item 4).
//
// 1. A booking URL for the hotel, if there is one: the hotel's own `booking_url`
//    column (optional, see supabase-migration-f2-reliability.sql), else the
//    HOTEL_BOOKING_URLS env (JSON, e.g. {"aracuya":"https://aracuya.com/reserve"}),
//    else Aracuya's default <ARACUYA_URL or https://aracuya.com>/reserve.
// 2. Otherwise a prefilled WhatsApp message to the hotel's WhatsApp or contact
//    number (a person replies). Never the MoMo payout phone (audit, Low).
// 3. Otherwise no button, just a "contact the hotel" note.

import type { Hotel } from "@/lib/db";

export type BookingTarget =
  | { kind: "url"; url: string }
  | { kind: "whatsapp"; phone: string }
  | { kind: "contact" };

type HotelFields = Pick<Hotel, "slug" | "whatsapp_display_phone" | "contact_phone"> & {
  booking_url?: string | null;
};
type Env = Record<string, string | undefined>;

function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const u = new URL(value.trim());
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export function resolveBookingUrl(hotel: HotelFields, env: Env = process.env): string | null {
  const own = safeHttpUrl(hotel.booking_url);
  if (own) return own;

  if (env.HOTEL_BOOKING_URLS) {
    try {
      const map = JSON.parse(env.HOTEL_BOOKING_URLS) as Record<string, unknown>;
      const fromEnv = safeHttpUrl(map?.[hotel.slug]);
      if (fromEnv) return fromEnv;
    } catch {
      // Bad JSON: ignore and fall through.
    }
  }

  if (hotel.slug === "aracuya") {
    const base = (safeHttpUrl(env.ARACUYA_URL) ?? "https://aracuya.com/").replace(/\/+$/, "");
    return `${base}/reserve`;
  }
  return null;
}

/** Digits of the number guests can message, or null. */
export function widgetWhatsAppPhone(hotel: HotelFields): string | null {
  for (const candidate of [hotel.whatsapp_display_phone, hotel.contact_phone]) {
    const digits = candidate?.replace(/\D/g, "") ?? "";
    if (digits.length >= 8) return digits;
  }
  return null;
}

export function bookingTarget(hotel: HotelFields, env: Env = process.env): BookingTarget {
  const url = resolveBookingUrl(hotel, env);
  if (url) return { kind: "url", url };
  const phone = widgetWhatsAppPhone(hotel);
  if (phone) return { kind: "whatsapp", phone };
  return { kind: "contact" };
}
