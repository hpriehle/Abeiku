import { NextRequest, NextResponse } from "next/server";
import { markAsRead } from "@/lib/whatsapp/client";
import { handleMessage } from "@/lib/whatsapp/state-machine";
import { WhatsAppWebhookPayload } from "@/lib/whatsapp/types";
import { getHotelByWhatsAppPhoneNumberId } from "@/lib/db";
import { hotelStorage } from "@/lib/hotel-context";

/**
 * GET — Webhook verification (Meta sends this when you register the webhook URL)
 *
 * Meta sends: hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=CHALLENGE
 * You must return the challenge value if the verify token matches.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode === "subscribe" && token === verifyToken) {
    console.log("Webhook verified successfully");
    return new NextResponse(challenge, { status: 200 });
  }

  console.warn("Webhook verification failed:", { mode, token: token?.slice(0, 5) + "..." });
  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

/**
 * POST — Receive incoming WhatsApp messages
 *
 * Meta sends message events here. We resolve the hotel from the phone_number_id
 * and process messages within that hotel's context.
 * IMPORTANT: Respond with 200 quickly to avoid retries.
 */
export async function POST(request: NextRequest) {
  try {
    const body: WhatsAppWebhookPayload = await request.json();

    // Validate it's a WhatsApp webhook
    if (body.object !== "whatsapp_business_account") {
      return NextResponse.json({ error: "Not a WhatsApp webhook" }, { status: 400 });
    }

    // Process each entry/change
    for (const entry of body.entry) {
      for (const change of entry.changes) {
        if (change.field !== "messages") continue;

        const messages = change.value.messages;
        if (!messages || messages.length === 0) continue;

        const contacts = change.value.contacts;
        const phoneNumberId = change.value.metadata.phone_number_id;

        // Resolve hotel from the WhatsApp phone number ID
        const hotel = await getHotelByWhatsAppPhoneNumberId(phoneNumberId);
        if (!hotel) {
          console.error(`No hotel found for phone_number_id: ${phoneNumberId}`);
          continue;
        }

        // Process messages within hotel context
        await hotelStorage.run({ hotelId: hotel.id, hotel }, async () => {
          for (const message of messages) {
            // Skip status updates (delivered, read, etc.)
            if (!message.from || !message.type) continue;

            const senderPhone = message.from;
            const senderName = contacts?.[0]?.profile?.name;

            // Mark as read immediately
            try {
              await markAsRead(message.id);
            } catch {
              // Non-critical, continue processing
            }

            // Process the message
            try {
              await handleMessage(message, senderPhone, senderName);
            } catch (error) {
              console.error(`Error handling message from ${senderPhone} (hotel: ${hotel.slug}):`, error);
            }
          }
        });
      }
    }

    // Always return 200 to prevent retries
    return NextResponse.json({ status: "ok" });
  } catch (error) {
    console.error("Webhook processing error:", error);
    // Still return 200 to prevent Meta from retrying
    return NextResponse.json({ status: "ok" });
  }
}
