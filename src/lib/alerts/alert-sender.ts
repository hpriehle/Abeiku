// Which WhatsApp number sends a hotel's manager booking alerts.
//
// A hotel with its own connected number always sends from it. A hotel without one can
// borrow a "platform sender": the hotel named by env WHATSAPP_ALERT_SENDER_HOTEL_ID
// (e.g. Test Hotel, which holds Meta's test number). The alert text still names the
// alerting hotel. Unset env = no fallback (alerts only from a hotel's own number).

type WhatsAppCreds = { whatsapp_access_token?: unknown; whatsapp_phone_number_id?: unknown };

export function hasOwnWhatsApp(hotel: WhatsAppCreds | null | undefined): boolean {
  return Boolean(hotel?.whatsapp_access_token && hotel.whatsapp_phone_number_id);
}

/** The platform sender hotel id, or null when the fallback is off. */
export function alertSenderHotelId(env: Record<string, string | undefined> = process.env): string | null {
  const id = env.WHATSAPP_ALERT_SENDER_HOTEL_ID?.trim();
  return id || null;
}

/**
 * The hotel whose number sends this hotel's alert: the hotel itself if it has its own
 * number, else the platform sender if configured and connected, else null (no WhatsApp).
 */
export async function pickAlertSender<H extends WhatsAppCreds>(
  hotel: H,
  loadHotel: (id: string) => Promise<H | null>,
  senderId: string | null = alertSenderHotelId()
): Promise<H | null> {
  if (hasOwnWhatsApp(hotel)) return hotel;
  if (!senderId) return null;
  const sender = await loadHotel(senderId);
  return hasOwnWhatsApp(sender) ? sender : null;
}
