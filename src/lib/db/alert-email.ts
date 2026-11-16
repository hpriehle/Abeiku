// Where a hotel's booking alert emails go (hotels.alert_email, added by docs/c2-alerts/booking-alerts.sql).
// Before that SQL runs the column is missing: writes report "missing" instead of throwing, so sign-up
// and Settings never fail because of it.

import { supabase } from "@/lib/supabase/client";
import { isMissingSchema } from "@/lib/db/hotel-feeds";
import { cleanEmail } from "@/lib/billing/signup-input";

export type AlertEmailParse = { ok: true; email: string | null } | { ok: false; error: string };

/** Empty clears it (no alert emails). Otherwise one valid address, stored lower case. */
export function parseAlertEmail(v: unknown): AlertEmailParse {
  if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) return { ok: true, email: null };
  if (typeof v === "string" && /[,;]/.test(v)) return { ok: false, error: "Enter one email address only." };
  const email = cleanEmail(v);
  return email ? { ok: true, email } : { ok: false, error: "Enter a valid email address." };
}

/** What Settings shows. available is false while the column is missing (select * leaves it out). */
export function alertEmailOf(hotel: Record<string, unknown>): { available: boolean; email: string | null } {
  if (!("alert_email" in hotel)) return { available: false, email: null };
  const e = hotel.alert_email;
  return { available: true, email: typeof e === "string" && e.trim() ? e.trim() : null };
}

export async function setHotelAlertEmail(hotelId: string, email: string | null): Promise<"ok" | "missing"> {
  const { error } = await supabase.from("hotels").update({ alert_email: email }).eq("id", hotelId);
  if (!error) return "ok";
  if (isMissingSchema(error)) {
    console.warn("[alert-email] hotels.alert_email missing, run docs/c2-alerts/booking-alerts.sql");
    return "missing";
  }
  throw error;
}
