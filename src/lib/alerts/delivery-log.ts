// alert_deliveries (docs/go-live-alert-deliveries.sql): one row per recipient per booking alert,
// so "did it arrive?" is answered from the database. Never throws: a log problem must never
// stop an alert. Before the SQL runs, the missing table is logged once.

import { supabase } from "@/lib/supabase/client";
import { isMissingSchema, type AlertDelivery } from "./booking-alerts";

let warnedMissing = false;

function logError(where: string, err: unknown) {
  if (isMissingSchema(err)) {
    if (!warnedMissing) console.warn("[alert-deliveries] table missing (run docs/go-live-alert-deliveries.sql); not logged");
    warnedMissing = true;
    return;
  }
  console.error(`[alert-deliveries] ${where} failed:`, (err as Error)?.message ?? err);
}

/** One insert for all of an alert's recipients. */
export async function logAlertDeliveries(rows: AlertDelivery[]): Promise<void> {
  if (!rows.length) return;
  try {
    const { error } = await supabase.from("alert_deliveries").insert(rows);
    if (error) logError("insert", error);
  } catch (err) {
    logError("insert", err);
  }
}

/** Statuses a webhook status may replace (they arrive out of order: never downgrade read -> delivered). */
const REPLACES: Record<string, string[]> = { delivered: ["sent"], read: ["sent", "delivered"], failed: ["sent", "delivered", "read"] };

/** WhatsApp webhook status for an alert's wamid (no row = not an alert, nothing happens). */
export async function updateAlertDeliveryStatus(wamid: string, status: string, error: string | null): Promise<void> {
  const from = REPLACES[status];
  if (!from) return;
  try {
    const { error: err } = await supabase
      .from("alert_deliveries")
      .update({ status, error, updated_at: new Date().toISOString() })
      .eq("provider_message_id", wamid)
      .in("status", from);
    if (err) logError("status update", err);
  } catch (err) {
    logError("status update", err);
  }
}
