import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin/auth";
import {
  getNotificationPreferences,
  upsertNotificationPreference,
  getNotificationLog,
} from "@/lib/db";
import type { NotificationEvent } from "@/lib/notifications/types";
import { NOTIFICATION_EVENTS } from "@/lib/notifications/types";

const VALID_EVENTS = NOTIFICATION_EVENTS.map((e) => e.event);

// GET — fetch preferences + recent log
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [preferences, recentLog] = await Promise.all([
    getNotificationPreferences(session.hotelId),
    getNotificationLog(session.hotelId, 20),
  ]);

  return NextResponse.json({ preferences, recentLog });
}

// PATCH — update a single preference
export async function PATCH(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { event_type, whatsapp_enabled, email_enabled } = body;

  if (!VALID_EVENTS.includes(event_type)) {
    return NextResponse.json({ error: "Invalid event type" }, { status: 400 });
  }

  await upsertNotificationPreference(session.hotelId, event_type as NotificationEvent, {
    ...(typeof whatsapp_enabled === "boolean" && { whatsapp_enabled }),
    ...(typeof email_enabled === "boolean" && { email_enabled }),
  });

  return NextResponse.json({ success: true });
}
