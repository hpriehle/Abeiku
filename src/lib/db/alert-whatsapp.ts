// The manager's WhatsApp number for booking alerts (hotels.alert_whatsapp, added by
// docs/go-live-whatsapp.sql). Alerts go there only while the hotel has its own WhatsApp
// number connected. Before the SQL runs the column is missing: writes report "missing".

import { supabase } from "@/lib/supabase/client";
import { isMissingSchema } from "@/lib/db/hotel-feeds";

export type AlertWhatsAppParse = { ok: true; phone: string | null } | { ok: false; error: string };

/** Empty clears it. Otherwise an international number, stored as "+<digits>". */
export function parseAlertWhatsApp(v: unknown): AlertWhatsAppParse {
  if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) return { ok: true, phone: null };
  if (typeof v !== "string" || /[,;/]/.test(v) || /[a-z]/i.test(v)) return { ok: false, error: "Enter one phone number only." };
  const trimmed = v.trim();
  const digits = trimmed.replace(/\D/g, "").replace(/^00/, "");
  if (!trimmed.startsWith("+") && !trimmed.startsWith("00")) {
    return { ok: false, error: "Include the country code, e.g. +233 55 154 2355." };
  }
  if (digits.length < 8 || digits.length > 15) return { ok: false, error: "Enter a valid phone number with country code." };
  return { ok: true, phone: `+${digits}` };
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
