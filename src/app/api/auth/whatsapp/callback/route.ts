import { randomInt } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin/auth";
import { supabase } from "@/lib/supabase/client";
import { GRAPH_BASE, graphFetch } from "@/lib/whatsapp/graph";

/**
 * POST /api/auth/whatsapp/callback
 *
 * Receives { code, phoneNumberId, wabaId, businessId, isOnBizApp } from the
 * Embedded Signup (v5) frontend, then:
 *   1. exchanges the code for a business integration token
 *   2. subscribes the WABA to our app so we receive its webhooks
 *   3. registers the number for Cloud API, unless it's a WhatsApp Business app
 *      number (coexistence), which is already registered
 *   4. for coexistence numbers, starts the contacts + history sync, which Meta
 *      requires within 24 hours of onboarding
 *   5. saves credentials on the hotel
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { code, phoneNumberId, wabaId, businessId, isOnBizApp } = (await request.json()) as {
    code?: string;
    phoneNumberId?: string;
    wabaId?: string;
    businessId?: string;
    isOnBizApp?: boolean;
  };

  if (!code || !phoneNumberId || !wabaId) {
    return NextResponse.json(
      { error: "Missing required fields: code, phoneNumberId, wabaId" },
      { status: 400 }
    );
  }

  const appId = process.env.WHATSAPP_APP_ID;
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appId || !appSecret) {
    console.error("Missing WHATSAPP_APP_ID or WHATSAPP_APP_SECRET");
    return NextResponse.json({ error: "WhatsApp not configured on this platform" }, { status: 500 });
  }

  try {
    // Step 1: Exchange the code for a business integration system user token.
    // These don't expire, so there's no long-lived exchange step.
    const tokenUrl = new URL(`${GRAPH_BASE}/oauth/access_token`);
    tokenUrl.searchParams.set("client_id", appId);
    tokenUrl.searchParams.set("client_secret", appSecret);
    tokenUrl.searchParams.set("code", code);

    const tokenRes = await fetch(tokenUrl);
    if (!tokenRes.ok) {
      console.error("Token exchange failed:", await tokenRes.text());
      return NextResponse.json({ error: "Token exchange failed" }, { status: 502 });
    }
    const { access_token: token } = (await tokenRes.json()) as { access_token: string };

    // Step 2: Subscribe the WABA to our app (webhooks)
    try {
      await graphFetch(`${wabaId}/subscribed_apps`, token, { method: "POST" });
    } catch (err) {
      console.error("WABA subscription failed:", err); // Non-fatal; can be retried manually
    }

    // Step 3: Register new Cloud API numbers. Coexistence numbers are already registered.
    let registrationPin: string | null = null;
    if (!isOnBizApp) {
      registrationPin = String(randomInt(0, 1_000_000)).padStart(6, "0");
      try {
        await graphFetch(`${phoneNumberId}/register`, token, {
          body: { messaging_product: "whatsapp", pin: registrationPin },
        });
      } catch (err) {
        console.error("Phone registration failed:", err); // Non-fatal; may already be registered
        registrationPin = null;
      }
    }

    // Step 4: Coexistence: kick off contacts and message history sync (each can only run once).
    if (isOnBizApp) {
      for (const syncType of ["smb_app_state_sync", "history"] as const) {
        try {
          const res = await graphFetch<{ request_id?: string }>(`${phoneNumberId}/smb_app_data`, token, {
            body: { messaging_product: "whatsapp", sync_type: syncType },
          });
          console.log(`[whatsapp] ${syncType} sync started for ${phoneNumberId}: ${res.request_id}`);
        } catch (err) {
          console.error(`[whatsapp] ${syncType} sync failed for ${phoneNumberId}:`, err);
        }
      }
    }

    // Step 5: Display phone number for wa.me links
    let displayPhone: string | null = null;
    try {
      const phone = await graphFetch<{ display_phone_number?: string }>(phoneNumberId, token, {
        query: { fields: "display_phone_number" },
      });
      displayPhone = phone.display_phone_number || null;
    } catch {
      // Non-fatal
    }

    // Step 6: Save to the hotel
    const base = {
      whatsapp_access_token: token,
      whatsapp_phone_number_id: phoneNumberId,
      whatsapp_waba_id: wabaId,
      whatsapp_display_phone: displayPhone,
      updated_at: new Date().toISOString(),
    };
    const extended = {
      ...base,
      whatsapp_is_on_biz_app: !!isOnBizApp,
      whatsapp_business_id: businessId ?? null,
      ...(registrationPin ? { whatsapp_registration_pin: registrationPin } : {}),
    };

    let { error: dbError } = await supabase.from("hotels").update(extended).eq("id", session.hotelId);
    if (dbError?.code === "PGRST204") {
      // Columns from supabase-migration-whatsapp-templates.sql not added yet; save the essentials.
      console.warn("WhatsApp migration not applied; saving base credentials only:", dbError.message);
      ({ error: dbError } = await supabase.from("hotels").update(base).eq("id", session.hotelId));
    }
    if (dbError) {
      console.error("Failed to save WhatsApp credentials:", dbError);
      return NextResponse.json({ error: "Failed to save credentials" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, coexistence: !!isOnBizApp });
  } catch (error) {
    console.error("WhatsApp Embedded Signup callback error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
