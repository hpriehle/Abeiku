// Tracked WhatsApp client — wraps outbound send functions to auto-log messages.
// Uses a request-scoped context set by the state machine's handleMessage().

import {
  sendText,
  sendButtons,
  sendList,
  sendCtaUrlButton,
  sendImage,
  sendLocation,
} from "./client";
import { logMessage } from "./chat-logger";
import { getHotelId } from "@/lib/hotel-context";
import type { ButtonAction, ListSection } from "./types";

// Request-scoped tracking context
let _currentContext: {
  conversationId: string;
  phone: string;
  guestState?: string;
  step?: string;
} | null = null;

export function setTrackingContext(ctx: typeof _currentContext) {
  _currentContext = ctx;
}

export function clearTrackingContext() {
  _currentContext = null;
}

function logOutbound(messageType: string, body: string | null, rawPayload?: object) {
  if (!_currentContext) return;
  try {
    const hotelId = getHotelId();
    logMessage({
      hotelId,
      conversationId: _currentContext.conversationId,
      phone: _currentContext.phone,
      direction: "outbound",
      messageType,
      body,
      rawPayload,
      senderType: "bot",
      guestState: _currentContext.guestState,
      step: _currentContext.step,
    });
  } catch {
    // Hotel context may not be available in all scenarios — silently skip
  }
}

export async function trackedSendText(to: string, text: string) {
  const result = await sendText(to, text);
  logOutbound("text", text);
  return result;
}

export async function trackedSendButtons(
  to: string,
  bodyText: string,
  buttons: ButtonAction[],
  headerText?: string
) {
  const result = await sendButtons(to, bodyText, buttons, headerText);
  logOutbound("interactive_buttons", bodyText, { buttons, headerText });
  return result;
}

export async function trackedSendList(
  to: string,
  bodyText: string,
  buttonLabel: string,
  sections: ListSection[],
  headerText?: string
) {
  const result = await sendList(to, bodyText, buttonLabel, sections, headerText);
  logOutbound("interactive_list", bodyText, { buttonLabel, sections, headerText });
  return result;
}

export async function trackedSendCtaUrlButton(
  to: string,
  bodyText: string,
  buttonText: string,
  url: string,
  headerText?: string
) {
  const result = await sendCtaUrlButton(to, bodyText, buttonText, url, headerText);
  logOutbound("interactive_cta_url", bodyText, { buttonText, url, headerText });
  return result;
}

export async function trackedSendImage(to: string, imageUrl: string, caption?: string) {
  const result = await sendImage(to, imageUrl, caption);
  logOutbound("image", caption ?? null, { imageUrl });
  return result;
}

export async function trackedSendLocation(
  to: string,
  lat: number,
  lng: number,
  name: string,
  address: string
) {
  const result = await sendLocation(to, lat, lng, name, address);
  logOutbound("location", `${name} - ${address}`, { lat, lng });
  return result;
}
