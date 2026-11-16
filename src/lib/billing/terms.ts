// Records when a hotel agreed to the Terms and Privacy Policy at sign-up (hotels.terms_accepted_at).
// The column is added by docs/go-live-terms.sql. Until that has run, sign-up must still work, so a
// missing column is logged and skipped rather than thrown.

import { supabase } from "@/lib/supabase/client";
import { isMissingColumnError } from "./store";

export type TermsSaveResult = "saved" | "column-missing" | "failed";

export async function recordTermsAccepted(hotelId: string, at: Date): Promise<TermsSaveResult> {
  try {
    const { error } = await supabase.from("hotels").update({ terms_accepted_at: at.toISOString() }).eq("id", hotelId);
    if (!error) return "saved";
    if (isMissingColumnError(error)) {
      console.warn("[signup] hotels.terms_accepted_at missing: run docs/go-live-terms.sql");
      return "column-missing";
    }
    console.error("[signup] could not save terms_accepted_at:", error);
    return "failed";
  } catch (err) {
    console.error("[signup] could not save terms_accepted_at:", err);
    return "failed";
  }
}
