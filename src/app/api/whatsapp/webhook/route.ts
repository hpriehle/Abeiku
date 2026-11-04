import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { markAsRead } from "@/lib/whatsapp/client";
import { handleMessage } from "@/lib/whatsapp/state-machine";
import { WhatsAppMessage, WhatsAppWebhookPayload } from "@/lib/whatsapp/types";
import { getHotelByWhatsAppPhoneNumberId, upsertConversation, type Hotel } from "@/lib/db";
import { hotelStorage } from "@/lib/hotel-context";
import { logMessage } from "@/lib/whatsapp/chat-logger";
import { supabase } from "@/lib/supabase/client";

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

/** Meta signs every POST with the app secret (X-Hub-Signature-256: sha256=<hex>). */
function signatureIsValid(rawBody: string, header: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) {
    console.warn("[webhook] WHATSAPP_APP_SECRET not set; skipping signature check");
    return true;
  }
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  const given = Buffer.from(header.slice(7), "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// Webhook payloads vary by field and message type; read them loosely.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = Record<string, any>;

/** Short text for the inbox, for any inbound or echoed message type. */
function messageBody(m: Loose): string {
  return (
    m.text?.body ??
    m.interactive?.button_reply?.title ??
    m.interactive?.list_reply?.title ??
    m.button?.text ??
    m.image?.caption ??
    m.video?.caption ??
    m.document?.caption ??
    m.document?.filename ??
    (m.reaction ? `Reacted ${m.reaction.emoji ?? ""}`.trim() : undefined) ??
    (m.type === "template" ? `[template ${m.template?.name ?? ""}]` : undefined) ??
    `[${m.type}]`
  );
}

interface StatusUpdate {
  id: string;
  status: "sent" | "delivered" | "read" | "failed" | string;
  timestamp: string;
  recipient_id: string;
  errors?: { code: number; title: string; message?: string; error_data?: { details?: string } }[];
}

const STATUS_RANK: Record<string, number> = { sent: 1, delivered: 2, read: 3, failed: 4 };

async function recordStatus(s: StatusUpdate) {
  // Statuses can arrive out of order; never downgrade read -> delivered.
  const { data: row } = await supabase
    .from("chat_messages")
    .select("id, wa_status")
    .eq("wa_message_id", s.id)
    .maybeSingle();
  if (!row) return;
  if ((STATUS_RANK[row.wa_status ?? ""] ?? 0) >= (STATUS_RANK[s.status] ?? 0)) return;

  const err = s.errors?.[0];
  const { error } = await supabase
    .from("chat_messages")
    .update({
      wa_status: s.status,
      wa_status_at: new Date(Number(s.timestamp) * 1000).toISOString(),
      wa_error: err ? `${err.code}: ${err.error_data?.details || err.message || err.title}` : null,
    })
    .eq("id", row.id);
  if (error && error.code !== "PGRST204") console.error("[webhook] status update error:", error.message);
  if (s.status === "failed") console.warn(`[webhook] message ${s.id} to ${s.recipient_id} failed:`, err);
}

/** Bot off: put the message in the inbox, don't reply. Staff answer from the inbox or the WhatsApp Business app. */
async function logInboundOnly(hotel: Hotel, message: WhatsAppMessage, senderName?: string) {
  const conv = await upsertConversation(hotel.id, message.from, senderName ? { guest_name: senderName } : {});
  logMessage({
    hotelId: hotel.id,
    conversationId: conv.id,
    phone: message.from,
    direction: "inbound",
    messageType: message.type,
    body: messageBody(message as unknown as Loose),
    rawPayload: message as unknown as object,
    waMessageId: message.id,
    senderType: "guest",
    senderName,
    guestState: conv.guest_state,
    step: conv.step,
  });
}

/** Coexistence: a message staff sent from the WhatsApp Business app on their phone. */
async function logEcho(hotel: Hotel, echo: Loose) {
  const conv = await upsertConversation(hotel.id, echo.to, {});
  logMessage({
    hotelId: hotel.id,
    conversationId: conv.id,
    phone: echo.to,
    direction: "outbound",
    messageType: echo.type,
    body: messageBody(echo),
    rawPayload: echo,
    waMessageId: echo.id,
    senderType: "admin",
    senderName: "WhatsApp Business app",
    guestState: conv.guest_state,
    step: conv.step,
  });
}

/**
 * POST — Receive WhatsApp webhooks: messages, delivery statuses, coexistence
 * echoes, template review results and account updates.
 * IMPORTANT: Respond with 200 quickly to avoid retries.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  if (!signatureIsValid(rawBody, request.headers.get("x-hub-signature-256"))) {
    console.warn("[webhook] invalid signature");
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
            await logEcho(hotel, echo).catch((e) => console.error("[webhook] echo log error:", e));
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

            if (!hotel.whatsapp_bot_enabled) {
              await logInboundOnly(hotel, message, senderName).catch((e) =>
                console.error(`[webhook] inbound log error (hotel: ${hotel.slug}):`, e),
              );
              continue;
            }

            try {
              await markAsRead(message.id);
            } catch {
              // Non-critical
            }
            try {
              await handleMessage(message, message.from, senderName);
            } catch (error) {
              console.error(`Error handling message from ${message.from} (hotel: ${hotel.slug}):`, error);
            }
          }
        });
      }
    }

    return NextResponse.json({ status: "ok" });
  } catch (error) {
    console.error("Webhook processing error:", error);
    // Still return 200 so Meta doesn't retry a payload we can't parse
    return NextResponse.json({ status: "ok" });
  }
}
