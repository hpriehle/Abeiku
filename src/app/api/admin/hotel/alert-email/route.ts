// PATCH /api/admin/hotel/alert-email: where booking alert emails go. Empty clears it.

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin/auth";
import { parseAlertEmail, setHotelAlertEmail } from "@/lib/db/alert-email";

export async function PATCH(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const parsed = parseAlertEmail(body.alert_email);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    const res = await setHotelAlertEmail(session.hotelId, parsed.email);
    if (res === "missing") {
      return NextResponse.json(
        { error: "Alert emails can't be changed yet. Please try again later.", notSetUp: true },
        { status: 503 },
      );
    }
    return NextResponse.json({ success: true, alert_email: parsed.email });
  } catch (err) {
    console.error("[alert-email] save:", (err as Error)?.message ?? err);
    return NextResponse.json({ error: "Something went wrong on our side. Please try again in a moment." }, { status: 500 });
  }
}
