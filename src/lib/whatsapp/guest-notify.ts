/**
 * Send WhatsApp notifications to guests from admin actions.
 * Fire-and-forget — never throws.
 */
import { getHotelById } from "@/lib/db";

const GRAPH_API_VERSION = "v21.0";

async function sendWhatsAppText(
  accessToken: string,
  phoneNumberId: string,
  to: string,
  text: string
): Promise<void> {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`;
  await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    }),
  });
}

type GuestEvent =
  | "booking_cancelled"
  | "booking_dates_changed"
  | "booking_checked_in"
  | "booking_checked_out";

interface EventData {
  guest_name: string;
  check_in?: string;
  check_out?: string;
  total_price?: number;
  currency?: string;
}

function buildMessage(event: GuestEvent, hotelName: string, data: EventData): string {
  switch (event) {
    case "booking_cancelled":
      return (
        `Hi ${data.guest_name}, your booking at ${hotelName}` +
        (data.check_in ? ` for ${data.check_in} — ${data.check_out}` : "") +
        ` has been cancelled. If you have any questions, please reach out to us.`
      );
    case "booking_dates_changed":
      return (
        `Hi ${data.guest_name}, your booking at ${hotelName} has been updated.\n\n` +
        `New dates: ${data.check_in} — ${data.check_out}\n` +
        (data.total_price ? `New total: ${data.currency} ${data.total_price}` : "")
      );
    case "booking_checked_in":
      return `Welcome, ${data.guest_name}! You've been checked in at ${hotelName}. Enjoy your stay!`;
    case "booking_checked_out":
      return `Thank you for staying at ${hotelName}, ${data.guest_name}! We hope you enjoyed your visit.`;
  }
}

export async function notifyGuest(
  hotelId: string,
  phone: string,
  event: GuestEvent,
  data: EventData
): Promise<void> {
  try {
    const hotel = await getHotelById(hotelId);
    if (!hotel?.whatsapp_access_token || !hotel?.whatsapp_phone_number_id) return;

    const message = buildMessage(event, hotel.name, data);
    await sendWhatsAppText(
      hotel.whatsapp_access_token,
      hotel.whatsapp_phone_number_id,
      phone,
      message
    );
  } catch (error) {
    console.error(`Failed to notify guest ${phone}:`, error);
  }
}
