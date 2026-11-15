// The hotel fields the admin browser pages may see. Tokens, keys and the MoMo verification
// amount/reference stay on the server: the verification amount is what the owner must prove they
// received, so sending it to the browser would defeat the check.

import type { Hotel } from "@/lib/db";

const BROWSER_FIELDS = [
  "id", "name", "slug",
  "contact_phone", "contact_email",
  "location_lat", "location_lng", "location_city", "location_country",
  "check_in_time", "check_out_time", "wifi_password", "currency", "greeting_message",
  "whatsapp_display_phone", "whatsapp_phone_number_id",
  "momo_phone", "momo_phone_verified", "payout_method", "google_place_id", "billing_plan",
] as const satisfies readonly (keyof Hotel)[];

export type HotelView = Pick<Hotel, (typeof BROWSER_FIELDS)[number]> & {
  /** True when a WhatsApp access token is stored (the token itself is never sent). */
  whatsapp_configured: boolean;
};

export function hotelView(hotel: Hotel): HotelView {
  const view = Object.fromEntries(BROWSER_FIELDS.map((k) => [k, hotel[k] ?? null])) as Omit<
    HotelView,
    "whatsapp_configured"
  >;
  return { ...view, whatsapp_configured: Boolean(hotel.whatsapp_access_token) };
}
