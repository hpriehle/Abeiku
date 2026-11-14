import { NextRequest, NextResponse } from "next/server";
import { handleBulkUpsert } from "@/lib/partner/bulk";
import { supabasePartnerAdminStore } from "@/lib/db/influencers";

// Server-to-server: create or update many partners at once (idempotent on whatsapp/email
// within the hotel). Auth: Authorization: Bearer $ABEIKU_ADMIN_API_SECRET.
// Sends no email or messages; returns code, ref link and setup link per partner.
export async function POST(request: NextRequest) {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null; // auth is still checked first, then the body fails validation (400)
  }
  try {
    const result = await handleBulkUpsert({
      authHeader: request.headers.get("authorization"),
      secret: process.env.ABEIKU_ADMIN_API_SECRET,
      body,
      store: supabasePartnerAdminStore,
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    console.error("Bulk partner upsert failed", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
