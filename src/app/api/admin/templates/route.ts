import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin/auth";
import { getMessageTemplates, upsertMessageTemplate, getTemplateSentCounts } from "@/lib/db";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [templates, sentCounts] = await Promise.all([
    getMessageTemplates(session.hotelId),
    getTemplateSentCounts(session.hotelId),
  ]);

  return NextResponse.json({ templates, sentCounts });
}

export async function PUT(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { templateType, body, active } = await request.json();

    if (!templateType || typeof body !== "string") {
      return NextResponse.json({ error: "templateType and body are required" }, { status: 400 });
    }

    const template = await upsertMessageTemplate(
      session.hotelId,
      templateType,
      body,
      active ?? true
    );

    return NextResponse.json({ success: true, template });
  } catch (error) {
    console.error("Update template error:", error);
    return NextResponse.json({ error: "Failed to update template" }, { status: 500 });
  }
}
