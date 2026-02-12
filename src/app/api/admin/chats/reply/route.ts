import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin/auth";
import { getConversation, getLastInboundMessageTime, getHotelById } from "@/lib/db";
import { logMessage } from "@/lib/whatsapp/chat-logger";
import { hotelStorage } from "@/lib/hotel-context";
import { sendText } from "@/lib/whatsapp/client";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { conversationId, message, type } = body as {
    conversationId: string;
    message: string;
    type: "free_text" | "template";
  };

  if (!conversationId || !message) {
    return NextResponse.json({ error: "Missing conversationId or message" }, { status: 400 });
  }

  try {
    // Find conversation — we need the phone number to send message
    // Since we only have conversationId, query by hotel_id and iterate
    const hotel = await getHotelById(session.hotelId);
    if (!hotel) {
      return NextResponse.json({ error: "Hotel not found" }, { status: 404 });
    }

    // Get conversation details from the messages table (we know the conversation ID)
    const { supabase } = await import("@/lib/supabase/client");
    const { data: conv, error: convError } = await supabase
      .from("conversations")
      .select("*")
      .eq("id", conversationId)
      .eq("hotel_id", session.hotelId)
      .maybeSingle();

    if (convError) throw convError;
    if (!conv) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    // Check 24h window for free_text
    if (type === "free_text") {
      const lastInbound = await getLastInboundMessageTime(session.hotelId, conversationId);
      if (!lastInbound) {
        return NextResponse.json({ error: "No inbound messages found" }, { status: 400 });
      }
      const hoursSince = (Date.now() - new Date(lastInbound).getTime()) / (1000 * 60 * 60);
      if (hoursSince >= 24) {
        return NextResponse.json(
          { error: "Outside 24h window. Use a template message to re-engage." },
          { status: 400 }
        );
      }
    }

    // Send via WhatsApp (must run in hotel context)
    await hotelStorage.run({ hotelId: hotel.id, hotel }, async () => {
      await sendText(conv.phone, message);
    });

    // Log admin message
    logMessage({
      hotelId: session.hotelId,
      conversationId,
      phone: conv.phone,
      direction: "outbound",
      messageType: "admin_reply",
      body: message,
      senderType: "admin",
      senderName: session.email,
      guestState: conv.guest_state,
      step: conv.step,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Reply error:", error);
    return NextResponse.json({ error: "Failed to send reply" }, { status: 500 });
  }
}
