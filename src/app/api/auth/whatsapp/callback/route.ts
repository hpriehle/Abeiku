import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin/auth";
import { supabase } from "@/lib/supabase/client";

const GRAPH_API_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

/**
 * POST /api/auth/whatsapp/callback
 *
 * Receives { code, phoneNumberId, wabaId } from the Embedded Signup frontend.
 * Exchanges the auth code for a long-lived token, subscribes the WABA to our app,
 * registers the phone number, and saves credentials to the hotels table.
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { code, phoneNumberId, wabaId } = await request.json();

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
    return NextResponse.json(
      { error: "WhatsApp not configured on this platform" },
      { status: 500 }
    );
  }

  try {
    // Step 1: Exchange auth code for short-lived token
    const tokenUrl = new URL(`${GRAPH_BASE}/oauth/access_token`);
    tokenUrl.searchParams.set("client_id", appId);
    tokenUrl.searchParams.set("client_secret", appSecret);
    tokenUrl.searchParams.set("code", code);

    const tokenRes = await fetch(tokenUrl.toString());
    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      console.error("Token exchange failed:", err);
      return NextResponse.json({ error: "Token exchange failed" }, { status: 502 });
    }
    const { access_token: shortLivedToken } = await tokenRes.json();

    // Step 2: Exchange short-lived token for long-lived token
    const longTokenUrl = new URL(`${GRAPH_BASE}/oauth/access_token`);
    longTokenUrl.searchParams.set("grant_type", "fb_exchange_token");
    longTokenUrl.searchParams.set("client_id", appId);
    longTokenUrl.searchParams.set("client_secret", appSecret);
    longTokenUrl.searchParams.set("fb_exchange_token", shortLivedToken);

    const longTokenRes = await fetch(longTokenUrl.toString());
    if (!longTokenRes.ok) {
      const err = await longTokenRes.text();
      console.error("Long-lived token exchange failed:", err);
      return NextResponse.json({ error: "Long-lived token exchange failed" }, { status: 502 });
    }
    const { access_token: longLivedToken } = await longTokenRes.json();

    // Step 3: Subscribe WABA to our app (so we receive webhooks)
    const subscribeRes = await fetch(`${GRAPH_BASE}/${wabaId}/subscribed_apps`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${longLivedToken}`,
        "Content-Type": "application/json",
      },
    });
    if (!subscribeRes.ok) {
      const err = await subscribeRes.text();
      console.error("WABA subscription failed:", err);
      // Non-fatal — continue anyway, can be done manually
    }

    // Step 4: Register the phone number
    const registerRes = await fetch(`${GRAPH_BASE}/${phoneNumberId}/register`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${longLivedToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        pin: "123456",
      }),
    });
    if (!registerRes.ok) {
      const err = await registerRes.text();
      console.error("Phone registration failed:", err);
      // Non-fatal — phone may already be registered
    }

    // Step 4.5: Fetch the display phone number for wa.me redirects
    let displayPhone: string | null = null;
    try {
      const phoneRes = await fetch(
        `${GRAPH_BASE}/${phoneNumberId}?fields=display_phone_number`,
        { headers: { Authorization: `Bearer ${longLivedToken}` } },
      );
      if (phoneRes.ok) {
        const phoneData = await phoneRes.json();
        displayPhone = phoneData.display_phone_number || null;
      }
    } catch {
      // Non-fatal — display phone can be fetched later
    }

    // Step 5: Save credentials to hotels table
    const { error: dbError } = await supabase
      .from("hotels")
      .update({
        whatsapp_access_token: longLivedToken,
        whatsapp_phone_number_id: phoneNumberId,
        whatsapp_waba_id: wabaId,
        whatsapp_display_phone: displayPhone,
        updated_at: new Date().toISOString(),
      })
      .eq("id", session.hotelId);

    if (dbError) {
      console.error("Failed to save WhatsApp credentials:", dbError);
      return NextResponse.json({ error: "Failed to save credentials" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("WhatsApp Embedded Signup callback error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
