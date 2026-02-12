import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin/auth";
import { getHotelById, getConversation } from "@/lib/db";
import { hotelStorage } from "@/lib/hotel-context";
import { simulatorStorage, SimulatorContext } from "@/lib/whatsapp/simulator-context";
import { handleMessage } from "@/lib/whatsapp/state-machine";
import type { WhatsAppMessage } from "@/lib/whatsapp/types";

interface SimulatorInput {
  phone: string;
  senderName?: string;
  text?: string;
  buttonReplyId?: string;
  buttonReplyTitle?: string;
  listReplyId?: string;
  listReplyTitle?: string;
  listReplyDescription?: string;
}

function buildMessage(input: SimulatorInput): WhatsAppMessage {
  const base = {
    from: input.phone,
    id: `sim_${Date.now()}`,
    timestamp: String(Math.floor(Date.now() / 1000)),
  };

  if (input.buttonReplyId) {
    return {
      ...base,
      type: "interactive",
      interactive: {
        type: "button_reply",
        button_reply: { id: input.buttonReplyId, title: input.buttonReplyTitle || "" },
      },
    };
  }

  if (input.listReplyId) {
    return {
      ...base,
      type: "interactive",
      interactive: {
        type: "list_reply",
        list_reply: { id: input.listReplyId, title: input.listReplyTitle || "", description: input.listReplyDescription },
      },
    };
  }

  return {
    ...base,
    type: "text",
    text: { body: input.text || "hi" },
  };
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const hotel = await getHotelById(session.hotelId);
  if (!hotel) return NextResponse.json({ error: "Hotel not found" }, { status: 404 });

  const input: SimulatorInput = await request.json();
  const message = buildMessage(input);
  const simContext: SimulatorContext = { messages: [] };

  try {
    await hotelStorage.run({ hotelId: hotel.id, hotel }, () =>
      simulatorStorage.run(simContext, () =>
        handleMessage(message, input.phone, input.senderName || "Test Guest")
      )
    );

    // Look up conversation ID so the simulator can poll for async messages
    const conversation = await getConversation(hotel.id, input.phone);

    return NextResponse.json({
      messages: simContext.messages,
      conversationId: conversation?.id ?? null,
    });
  } catch (error) {
    console.error("Simulator error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
