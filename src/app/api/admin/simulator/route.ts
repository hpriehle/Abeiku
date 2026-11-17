import { NextRequest, NextResponse } from "next/server";
import { isBookingBotEnabled } from "@/lib/whatsapp/inbound";
import { getSession } from "@/lib/admin/auth";
import { adminFeatures } from "@/lib/admin/features";
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
  // L3: the Simulator is for platform admins and exempt hotels only.
  if (!adminFeatures(hotel, session.role).simulator) return NextResponse.json({ error: "Not available" }, { status: 403 });

  // F2: the simulator runs the real booking flow (it creates real booking rows),
  // so it only works for a hotel that has the WhatsApp booking bot switched on.
  if (!isBookingBotEnabled(hotel)) {
    return NextResponse.json(
      {
        error:
          "The WhatsApp booking bot is switched off for this hotel (people reply to guests), so there is nothing to simulate.",
      },
      { status: 409 }
    );
  }

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
    return NextResponse.json({ error: "The simulator hit an error. Please try again." }, { status: 500 });
  }
}
