import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin/auth";
import { getHotelById, upsertConversation } from "@/lib/db";
import { hotelStorage } from "@/lib/hotel-context";
import { sendTemplate } from "@/lib/whatsapp/client";
import { logMessage } from "@/lib/whatsapp/chat-logger";
import { GraphError } from "@/lib/whatsapp/graph";
import { listTemplates, renderTemplateText, countPlaceholders, normalizePhone } from "@/lib/whatsapp/templates";

/**
 * POST — send an approved template to one phone number.
 * Body: { to, name, language, bodyParams?, headerParam?, guestName? }
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const hotel = await getHotelById(session.hotelId);
  if (!hotel) return NextResponse.json({ error: "Hotel not found" }, { status: 404 });
  if (!hotel.whatsapp_access_token || !hotel.whatsapp_phone_number_id) {
    return NextResponse.json({ error: "WhatsApp is not connected for this hotel" }, { status: 400 });
  }

  const { to, name, language, bodyParams = [], headerParam, guestName } = (await request.json()) as {
    to: string;
    name: string;
    language: string;
    bodyParams?: string[];
    headerParam?: string;
    guestName?: string;
  };

  const phone = normalizePhone(to ?? "");
  if (phone.length < 8 || phone.length > 15) {
    return NextResponse.json(
      { error: "Enter the number in international format, e.g. +233 24 123 4567" },
      { status: 400 },
    );
  }
  if (!name || !language) return NextResponse.json({ error: "Pick a template" }, { status: 400 });

  try {
    // Check the template against Meta so we fail with a clear message before sending.
    const template = (await listTemplates(hotel)).find((t) => t.name === name && t.language === language);
    if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });
    if (template.status !== "APPROVED") {
      return NextResponse.json({ error: `Template is ${template.status.toLowerCase()}, not approved yet` }, { status: 400 });
    }
    const bodyText = template.components.find((c) => c.type === "BODY")?.text;
    const needed = countPlaceholders(bodyText);
    if (bodyParams.filter((v) => v?.trim()).length < needed) {
      return NextResponse.json({ error: `Fill in all ${needed} variables` }, { status: 400 });
    }
    const headerText = template.components.find((c) => c.type === "HEADER" && c.format === "TEXT")?.text;
    if (countPlaceholders(headerText) > 0 && !headerParam?.trim()) {
      return NextResponse.json({ error: "Fill in the header variable" }, { status: 400 });
    }

    const waMessageId = await hotelStorage.run({ hotelId: hotel.id, hotel }, () =>
      sendTemplate(phone, { name, language, bodyParams, headerParam: headerParam || undefined }),
    );

    // Record it in the inbox so replies land in the same thread.
    const conv = await upsertConversation(hotel.id, phone, guestName?.trim() ? { guest_name: guestName.trim() } : {});
    logMessage({
      hotelId: hotel.id,
      conversationId: conv.id,
      phone,
      direction: "outbound",
      messageType: "template",
      body: renderTemplateText(template, bodyParams, headerParam),
      rawPayload: { template: { name, language, bodyParams, headerParam } },
      waMessageId,
      senderType: "admin",
      senderName: session.email,
      guestState: conv.guest_state,
      step: conv.step,
    });

    return NextResponse.json({ ok: true, waMessageId, conversationId: conv.id });
  } catch (err) {
    if (err instanceof GraphError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "Failed to send";
    console.error("Send template error:", err);
    // client.ts throws "WhatsApp API error: <status> <json>" — surface Meta's message
    const metaMsg = message.match(/"message":"([^"]+)"/)?.[1];
    return NextResponse.json({ error: metaMsg || "Failed to send template" }, { status: 502 });
  }
}
