// POST /api/admin/platform/hotels: platform admin acts on a hotel (gap #14). Every action writes
// a platform_actions row (docs/go-live-platform-actions.sql). Internal tool: plain error text.

import { NextRequest, NextResponse } from "next/server";
import { createSessionToken, getSession, getSessionCookieOptions, type SessionPayload } from "@/lib/admin/auth";
import { billingDeps } from "@/lib/billing";
import { extendTrial } from "@/lib/billing/flow";
import { errorResponse } from "@/lib/billing/route-helpers";
import { supabaseBillingStore } from "@/lib/billing/supabase-store";
import { supabase } from "@/lib/supabase/client";

const ACTIONS = ["extend_trial", "set_exempt", "unset_exempt", "suspend", "unsuspend", "view_as", "view_back"] as const;
type Action = (typeof ACTIONS)[number];
const TRIAL_DAYS = [7, 14, 30];

async function setHotel(hotelId: string, patch: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.from("hotels").update(patch).eq("id", hotelId);
  if (error) throw error;
}

/** false if the row could not be written (table missing?): the action itself already happened. */
async function audit(session: SessionPayload, hotelId: string, action: Action, detail: string | null): Promise<boolean> {
  const { error } = await supabase
    .from("platform_actions")
    .insert({ actor_id: session.userId, actor_email: session.email, hotel_id: hotelId, action, detail });
  if (error) console.error("[platform] audit row not written (run docs/go-live-platform-actions.sql?):", action, hotelId, error.message);
  return !error;
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "platform_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await request.json().catch(() => null)) as { hotelId?: unknown; action?: unknown; days?: unknown } | null;
  const action = body?.action as Action;
  if (!ACTIONS.includes(action)) return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  // view_back goes to the home hotel, so it needs no hotelId.
  const hotelId = action === "view_back" ? session.homeHotelId : body?.hotelId;
  if (typeof hotelId !== "string" || !hotelId) return NextResponse.json({ error: "hotelId missing" }, { status: 400 });

  try {
    const hotel = await supabaseBillingStore.getHotel(hotelId);
    if (!hotel) return NextResponse.json({ error: "Hotel not found" }, { status: 404 });
    let detail: string | null = null;
    let res: NextResponse | null = null;

    switch (action) {
      case "extend_trial": {
        const days = body?.days;
        if (typeof days !== "number" || !TRIAL_DAYS.includes(days)) return NextResponse.json({ error: "days must be 7, 14 or 30" }, { status: 400 });
        const { trialEndsAt } = await extendTrial(billingDeps(), hotelId, days);
        detail = `+${days} days, trial ends ${trialEndsAt} (was ${hotel.trial_ends_at ?? "none"})`;
        break;
      }
      case "set_exempt": {
        // An exempt hotel is shown as free: it must not still have a live subscription charging it.
        const live = ["trialing", "active", "past_due"].includes(hotel.billing_status ?? "") && !!hotel.billing_subscription_id;
        if (live) return NextResponse.json({ error: "Has a live subscription: cancel it first (Plan page or provider dashboard), then set exempt." }, { status: 409 });
        await setHotel(hotelId, { billing_exempt: true });
        break;
      }
      case "unset_exempt":
        await setHotel(hotelId, { billing_exempt: false });
        break;
      case "suspend":
        await setHotel(hotelId, { suspended_at: new Date().toISOString() });
        break;
      case "unsuspend":
        await setHotel(hotelId, { suspended_at: null });
        break;
      case "view_as":
      case "view_back": {
        // Same login, another hotel's id; homeHotelId remembers the way back (and shows the banner).
        const back = action === "view_back" || hotelId === session.homeHotelId;
        const home = back ? {} : { homeHotelId: session.homeHotelId ?? session.hotelId, homeHotelName: session.homeHotelName ?? session.hotelName };
        const { userId, email, role, sv } = session;
        const token = await createSessionToken({ userId, email, role, sv, hotelId, hotelName: hotel.name, ...home });
        const { name, options } = getSessionCookieOptions();
        res = NextResponse.json({ ok: true, audited: true });
        res.cookies.set(name, token, options);
        break;
      }
    }

    const audited = await audit(session, hotelId, action, detail);
    if (res) {
      if (!audited) return NextResponse.json({ error: "Audit row could not be written: not switched." }, { status: 503 });
      return res;
    }
    return NextResponse.json({ ok: true, audited });
  } catch (err) {
    return errorResponse(err, `platform ${action}`);
  }
}
