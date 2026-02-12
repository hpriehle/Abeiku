// WhatsApp Cloud API client — send messages, buttons, lists

import { getHotel } from "@/lib/hotel-context";
import { getSimulatorContext } from "./simulator-context";
import { ButtonAction, ListSection } from "./types";

const GRAPH_API_VERSION = "v21.0";

function getConfig() {
  const hotel = getHotel();

  // In simulator mode, return dummy credentials (sendRequest will intercept before using them)
  if (getSimulatorContext()) {
    return { token: "simulator", phoneNumberId: "simulator" };
  }

  if (!hotel.whatsapp_access_token || !hotel.whatsapp_phone_number_id) {
    throw new Error(`Hotel "${hotel.name}" missing WhatsApp credentials`);
  }

  return { token: hotel.whatsapp_access_token, phoneNumberId: hotel.whatsapp_phone_number_id };
}

async function sendRequest(phoneNumberId: string, token: string, body: object) {
  // Simulator mode: capture outbound message instead of calling Meta API
  const simCtx = getSimulatorContext();
  if (simCtx) {
    const b = body as Record<string, unknown>;
    simCtx.messages.push({ type: (b.type as string) ?? (b.status as string) ?? "unknown", to: (b.to as string) ?? "", body });
    return { messages: [{ id: `sim_${Date.now()}_${Math.random().toString(36).slice(2)}` }] };
  }

  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("WhatsApp API error:", response.status, error);
    throw new Error(`WhatsApp API error: ${response.status} ${error}`);
  }

  return response.json();
}

/** Send a plain text message */
export async function sendText(to: string, text: string) {
  const { token, phoneNumberId } = getConfig();

  return sendRequest(phoneNumberId, token, {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body: text },
  });
}

/** Send a message with up to 3 reply buttons */
export async function sendButtons(
  to: string,
  bodyText: string,
  buttons: ButtonAction[],
  headerText?: string
) {
  const { token, phoneNumberId } = getConfig();

  const interactive: Record<string, unknown> = {
    type: "button",
    body: { text: bodyText },
    action: {
      buttons: buttons.slice(0, 3).map((btn) => ({
        type: "reply",
        reply: { id: btn.id, title: btn.title.slice(0, 20) },
      })),
    },
  };

  if (headerText) {
    interactive.header = { type: "text", text: headerText };
  }

  return sendRequest(phoneNumberId, token, {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive,
  });
}

/** Send a list message with sections and rows */
export async function sendList(
  to: string,
  bodyText: string,
  buttonLabel: string,
  sections: ListSection[],
  headerText?: string
) {
  const { token, phoneNumberId } = getConfig();

  const interactive: Record<string, unknown> = {
    type: "list",
    body: { text: bodyText },
    action: {
      button: buttonLabel.slice(0, 20),
      sections: sections.map((section) => ({
        title: section.title,
        rows: section.rows.map((row) => ({
          id: row.id,
          title: row.title.slice(0, 24),
          description: row.description?.slice(0, 72),
        })),
      })),
    },
  };

  if (headerText) {
    interactive.header = { type: "text", text: headerText };
  }

  return sendRequest(phoneNumberId, token, {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive,
  });
}

/** Send a message with a CTA URL button (opens a link in the browser) */
export async function sendCtaUrlButton(
  to: string,
  bodyText: string,
  buttonText: string,
  url: string,
  headerText?: string
) {
  const { token, phoneNumberId } = getConfig();

  const interactive: Record<string, unknown> = {
    type: "cta_url",
    body: { text: bodyText },
    action: {
      name: "cta_url",
      parameters: {
        display_text: buttonText.slice(0, 20),
        url,
      },
    },
  };

  if (headerText) {
    interactive.header = { type: "text", text: headerText };
  }

  return sendRequest(phoneNumberId, token, {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive,
  });
}

/** Send an image message */
export async function sendImage(to: string, imageUrl: string, caption?: string) {
  const { token, phoneNumberId } = getConfig();

  return sendRequest(phoneNumberId, token, {
    messaging_product: "whatsapp",
    to,
    type: "image",
    image: {
      link: imageUrl,
      ...(caption && { caption }),
    },
  });
}

/** Send a location message */
export async function sendLocation(
  to: string,
  latitude: number,
  longitude: number,
  name: string,
  address: string
) {
  const { token, phoneNumberId } = getConfig();

  return sendRequest(phoneNumberId, token, {
    messaging_product: "whatsapp",
    to,
    type: "location",
    location: { latitude, longitude, name, address },
  });
}

/** Mark a message as read */
export async function markAsRead(messageId: string) {
  const { token, phoneNumberId } = getConfig();

  return sendRequest(phoneNumberId, token, {
    messaging_product: "whatsapp",
    status: "read",
    message_id: messageId,
  });
}
