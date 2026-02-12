import {
  getHotelById,
  getNotificationPreferences,
  createNotificationLog,
} from "@/lib/db";
import { sendText } from "@/lib/whatsapp/client";
import { sendEmail } from "./email";
import { buildContent } from "./content";
import { hotelStorage } from "@/lib/hotel-context";
import type { NotificationEvent } from "./types";

/**
 * Send owner notification for an event.
 * Checks preferences, sends via enabled channels, logs everything.
 *
 * Fire-and-forget safe — fully try/catch wrapped, never crashes caller.
 * Can be called from inside or outside hotelStorage.run().
 */
export async function notifyOwner(
  hotelId: string,
  event: NotificationEvent,
  data: Record<string, unknown>
): Promise<void> {
  try {
    const hotel = await getHotelById(hotelId);
    if (!hotel) return;

    const prefs = await getNotificationPreferences(hotelId);
    const pref = prefs.find((p) => p.event_type === event);

    // Default: email on, whatsapp off
    const emailEnabled = pref?.email_enabled ?? true;
    const whatsappEnabled = pref?.whatsapp_enabled ?? false;

    if (!emailEnabled && !whatsappEnabled) return;

    const content = buildContent(event, hotel, data);

    // --- Email ---
    if (emailEnabled && hotel.contact_email) {
      const result = await sendEmail({
        to: hotel.contact_email,
        subject: content.subject,
        html: content.htmlBody,
      });

      await createNotificationLog({
        hotel_id: hotelId,
        event_type: event,
        channel: "email",
        recipient: hotel.contact_email,
        subject: content.subject,
        body_preview: content.textBody.slice(0, 200),
        status: result.success ? "sent" : "failed",
        error_message: result.error ?? null,
        metadata: data,
      });
    }

    // --- WhatsApp ---
    if (whatsappEnabled && hotel.contact_phone && hotel.whatsapp_access_token) {
      try {
        const sendWA = async () => {
          await sendText(hotel.contact_phone!, content.textBody);
        };

        // Check if we're already inside a hotel context
        const existingCtx = hotelStorage.getStore();
        if (existingCtx && existingCtx.hotelId === hotelId) {
          await sendWA();
        } else {
          await hotelStorage.run({ hotelId, hotel }, sendWA);
        }

        await createNotificationLog({
          hotel_id: hotelId,
          event_type: event,
          channel: "whatsapp",
          recipient: hotel.contact_phone,
          subject: null,
          body_preview: content.textBody.slice(0, 200),
          status: "sent",
          error_message: null,
          metadata: data,
        });
      } catch (err) {
        await createNotificationLog({
          hotel_id: hotelId,
          event_type: event,
          channel: "whatsapp",
          recipient: hotel.contact_phone ?? "unknown",
          subject: null,
          body_preview: content.textBody.slice(0, 200),
          status: "failed",
          error_message: err instanceof Error ? err.message : "WhatsApp send failed",
          metadata: data,
        });
      }
    }
  } catch (err) {
    console.error(`[notifications] Failed to notify owner for ${event}:`, err);
  }
}
