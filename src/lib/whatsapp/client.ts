// WhatsApp Cloud API client — send messages, buttons, lists

import { getHotel } from "@/lib/hotel-context";
import { getSimulatorContext } from "./simulator-context";
import { ButtonAction, ListSection } from "./types";
import { GRAPH_BASE } from "./graph";

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

  const url = `${GRAPH_BASE}/${phoneNumberId}/messages`;

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

export interface TemplateSendParams {
  /** Approved template name, e.g. "booking_reminder" */
  name: string;
  /** Template language code, e.g. "en" or "en_US" */
  language: string;
  /** Values for {{1}}, {{2}}... in the body, in order */
  bodyParams?: string[];
  /** Value for {{1}} in a text header, if the template has one */
  headerParam?: string;
  /** Values for the {{1}} suffix of dynamic URL buttons, keyed by button index */
  urlButtonParams?: Record<number, string>;
}

/** Build the `components` array for a template send. Exported for previews/tests. */
export function buildTemplateComponents(p: TemplateSendParams) {
  const components: object[] = [];
  if (p.headerParam) {
    components.push({ type: "header", parameters: [{ type: "text", text: p.headerParam }] });
  }
  if (p.bodyParams?.length) {
    components.push({
      type: "body",
      parameters: p.bodyParams.map((text) => ({ type: "text", text })),
    });
  }
  for (const [index, text] of Object.entries(p.urlButtonParams ?? {})) {
    components.push({
      type: "button",
      sub_type: "url",
      index,
      parameters: [{ type: "text", text }],
    });
  }
  return components;
}

/**
 * Send an approved message template. Templates are the only way to message
 * someone who hasn't written to the hotel in the last 24 hours.
 * Returns the WhatsApp message ID.
 */
export async function sendTemplate(to: string, params: TemplateSendParams): Promise<string | undefined> {
  const { token, phoneNumberId } = getConfig();
  const components = buildTemplateComponents(params);

  const res = await sendRequest(phoneNumberId, token, {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: params.name,
      language: { code: params.language },
      ...(components.length ? { components } : {}),
    },
  });
  return res?.messages?.[0]?.id;
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
