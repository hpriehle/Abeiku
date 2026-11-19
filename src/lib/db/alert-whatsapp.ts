// The manager's WhatsApp number for booking alerts (hotels.alert_whatsapp, added by
// docs/go-live-whatsapp.sql). Alerts go there only while the hotel has its own WhatsApp
// number connected. Before the SQL runs the column is missing: writes report "missing".

import { supabase } from "@/lib/supabase/client";
import { isMissingSchema } from "@/lib/db/hotel-feeds";
import { splitRecipients } from "@/lib/alerts/booking-alerts";

export type AlertWhatsAppParse = { ok: true; phone: string | null } | { ok: false; error: string };

/** One number: an international number, returned as "+<digits>". `label` names it in errors when there are several. */
function parseOne(v: string, label: string | null): { ok: true; phone: string } | { ok: false; error: string } {
  const trimmed = v.trim();
  const which = label ? ` ("${label.slice(0, 40)}")` : "";
  if (/[/]/.test(trimmed) || /[a-z]/i.test(trimmed)) return { ok: false, error: `Enter a valid phone number with country code${which}.` };
  const digits = trimmed.replace(/\D/g, "").replace(/^00/, "");
  if (!trimmed.startsWith("+") && !trimmed.startsWith("00")) {
    return { ok: false, error: `Include the country code${which}, e.g. +233 55 154 2355.` };
  }
  if (digits.length < 8 || digits.length > 15) return { ok: false, error: `Enter a valid phone number with country code${which}.` };
  return { ok: true, phone: `+${digits}` };
}

/**
 * Empty clears it. Otherwise one or more international numbers separated by commas, stored as
 * "+<digits>, +<digits>" (a single number is stored as "+<digits>", as before).
 */
export function parseAlertWhatsApp(v: unknown): AlertWhatsAppParse {
  if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) return { ok: true, phone: null };
  if (typeof v !== "string") return { ok: false, error: "Enter a valid phone number with country code." };
  const entries = splitRecipients(v);
  const out: string[] = [];
  for (const entry of entries) {
    const one = parseOne(entry, entries.length > 1 ? entry : null);
    if (!one.ok) return one;
    if (!out.includes(one.phone)) out.push(one.phone);
  }
  if (!out.length) return { ok: true, phone: null };
  return { ok: true, phone: out.join(", ") };
}

/** What Settings shows. available is false while the column is missing (select * leaves it out). */
export function alertWhatsAppOf(hotel: Record<string, unknown>): { available: boolean; phone: string | null; connected: boolean } {
  const connected = Boolean(hotel.whatsapp_access_token && hotel.whatsapp_phone_number_id);
  if (!("alert_whatsapp" in hotel)) return { available: false, phone: null, connected };
  const p = hotel.alert_whatsapp;
  return { available: true, phone: typeof p === "string" && p.trim() ? p.trim() : null, connected };
}

export async function setHotelAlertWhatsApp(hotelId: string, phone: string | null): Promise<"ok" | "missing"> {
  const { error } = await supabase.from("hotels").update({ alert_whatsapp: phone }).eq("id", hotelId);
  if (!error) return "ok";
  if (isMissingSchema(error)) {
    console.warn("[alert-whatsapp] hotels.alert_whatsapp missing, run docs/go-live-whatsapp.sql");
    return "missing";
  }
  throw error;
}
