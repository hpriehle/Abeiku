import { NextRequest, NextResponse } from "next/server";
import { markAsRead } from "@/lib/whatsapp/client";
import { handleMessage } from "@/lib/whatsapp/state-machine";
import { WhatsAppMessage, WhatsAppWebhookPayload } from "@/lib/whatsapp/types";
import {
  getHotelByWhatsAppPhoneNumberId,
  determineGuestState,
  getConversation,
  upsertConversation,
} from "@/lib/db";
import { hotelStorage } from "@/lib/hotel-context";
import { recordMessage } from "@/lib/whatsapp/chat-logger";
import { processInbound, storeEcho, type InboundDeps } from "@/lib/whatsapp/inbound";
import { checkWebhookSignature } from "@/lib/whatsapp/signature";
import { supabase } from "@/lib/supabase/client";
import { opsAlert } from "@/lib/ops/alerts";
import { updateAlertDeliveryStatus } from "@/lib/alerts/delivery-log";

const inboundDeps: InboundDeps = {
  determineGuestState,
  getConversation,
  upsertConversation,
  recordMessage,
  handleMessage,
  markAsRead,
};

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

  if (mode === "subscribe" && verifyToken && token === verifyToken) {
    console.log("Webhook verified successfully");
    return new NextResponse(challenge, { status: 200 });
  }

  console.warn("Webhook verification failed:", { mode, token: token?.slice(0, 5) + "..." });
  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

// Webhook payloads vary by field and message type; read them loosely.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = Record<string, any>;

interface StatusUpdate {
  id: string;
  status: "sent" | "delivered" | "read" | "failed" | string;
  timestamp: string;
  recipient_id: string;
  errors?: { code: number; title: string; message?: string; error_data?: { details?: string } }[];
}

const STATUS_RANK: Record<string, number> = { sent: 1, delivered: 2, read: 3, failed: 4 };

async function recordStatus(s: StatusUpdate) {
  const err = s.errors?.[0];
  const errText = err ? `${err.code}: ${err.error_data?.details || err.message || err.title}` : null;
  // Booking alerts (not in chat_messages): never throws.
  await updateAlertDeliveryStatus(s.id, s.status, errText);
  // Statuses can arrive out of order; never downgrade read -> delivered.
  const { data: row } = await supabase
    .from("chat_messages")
    .select("id, wa_status")
    .eq("wa_message_id", s.id)
    .maybeSingle();
  if (!row) return;
  if ((STATUS_RANK[row.wa_status ?? ""] ?? 0) >= (STATUS_RANK[s.status] ?? 0)) return;

  const { error } = await supabase
    .from("chat_messages")
    .update({
      wa_status: s.status,
      wa_status_at: new Date(Number(s.timestamp) * 1000).toISOString(),
      wa_error: errText,
    })
    .eq("id", row.id);
  if (error && error.code !== "PGRST204") console.error("[webhook] status update error:", error.message);
  if (s.status === "failed") console.warn(`[webhook] message ${s.id} to ${s.recipient_id} failed:`, err);
}

/**
 * POST — Receive WhatsApp webhooks: messages, delivery statuses, coexistence
 * echoes, template review results and account updates.
 * IMPORTANT: Respond with 200 quickly to avoid retries.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const sig = checkWebhookSignature(rawBody, request.headers.get("x-hub-signature-256"), process.env.WHATSAPP_APP_SECRET);
  if (sig !== "ok") {
    if (sig === "missing-secret") console.error("[webhook] WHATSAPP_APP_SECRET is not set; refusing webhook POST");
    else console.warn(`[webhook] rejected POST: ${sig}`);
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  try {
    const body = JSON.parse(rawBody) as WhatsAppWebhookPayload;

    if (body.object !== "whatsapp_business_account") {
      return NextResponse.json({ error: "Not a WhatsApp webhook" }, { status: 400 });
    }

    for (const entry of body.entry) {
      for (const change of entry.changes) {
        const value = change.value as WhatsAppWebhookPayload["entry"][number]["changes"][number]["value"] &
          Loose;

        // Account-level events don't carry a phone number
        if (change.field === "message_template_status_update") {
          console.log(
            `[webhook] template ${value.message_template_name} (${value.message_template_language}) -> ${value.event}`,
            value.reason ?? "",
          );
          continue;
        }
        if (change.field === "account_update") {
          console.log(`[webhook] account_update for WABA ${entry.id}: ${value.event}`, value.disconnection_info ?? "");
          continue;
        }

        const phoneNumberId = value.metadata?.phone_number_id;
        if (!phoneNumberId) continue;
        const hotel = await getHotelByWhatsAppPhoneNumberId(phoneNumberId);
        if (!hotel) {
          console.error(`No hotel found for phone_number_id: ${phoneNumberId}`);
          continue;
        }

        if (change.field === "smb_message_echoes") {
          for (const echo of value.message_echoes ?? []) {
            await storeEcho(inboundDeps, hotel.id, echo).catch((e) => console.error("[webhook] echo log error:", e));
          }
          continue;
        }
        if (change.field === "history" || change.field === "smb_app_state_sync") {
          // Coexistence sync payloads. Acknowledged; importing history into the inbox is a follow-up.
          const progress = value.history?.[0]?.metadata?.progress;
          console.log(`[webhook] ${change.field} for ${hotel.slug}${progress != null ? ` (${progress}%)` : ""}`);
          continue;
        }
        if (change.field !== "messages") continue;

        for (const s of (value.statuses ?? []) as StatusUpdate[]) {
          await recordStatus(s).catch((e) => console.error("[webhook] status error:", e));
        }

        const messages = value.messages;
        if (!messages || messages.length === 0) continue;
        const senderName = value.contacts?.[0]?.profile?.name;

        await hotelStorage.run({ hotelId: hotel.id, hotel }, async () => {
          for (const message of messages) {
            if (!message.from || !message.type) continue;

            // Booking bot only if switched on for this hotel (default off);
            // otherwise the message is just stored for the inbox.
            try {
              await processInbound(inboundDeps, hotel, message as WhatsAppMessage, message.from, senderName);
            } catch (error) {
              console.error(`Error handling message from ${message.from} (hotel: ${hotel.slug}):`, error);
              await opsAlert("whatsapp-webhook", `WhatsApp message for ${hotel.slug} could not be handled`, error);
            }
          }
        });
      }
    }

    return NextResponse.json({ status: "ok" });
  } catch (error) {
    console.error("Webhook processing error:", error);
    await opsAlert("whatsapp-webhook", "WhatsApp webhook failed", error);
    // Still return 200 so Meta doesn't retry a payload we can't parse
    return NextResponse.json({ status: "ok" });
  }
}
