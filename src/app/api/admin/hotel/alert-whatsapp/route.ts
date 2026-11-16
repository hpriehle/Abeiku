// PATCH /api/admin/hotel/alert-whatsapp: the manager's WhatsApp number for booking alerts. Empty clears it.

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin/auth";
import { parseAlertWhatsApp, setHotelAlertWhatsApp } from "@/lib/db/alert-whatsapp";

export async function PATCH(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const parsed = parseAlertWhatsApp(body.alert_whatsapp);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    const res = await setHotelAlertWhatsApp(session.hotelId, parsed.phone);
    if (res === "missing") {
      return NextResponse.json(
        { error: "WhatsApp alerts can't be set up yet. Please try again later.", notSetUp: true },
        { status: 503 },
      );
    }
    return NextResponse.json({ success: true, alert_whatsapp: parsed.phone });
  } catch (err) {
    console.error("[alert-whatsapp] save:", (err as Error)?.message ?? err);
    return NextResponse.json({ error: "Something went wrong on our side. Please try again in a moment." }, { status: 500 });
  }
}
