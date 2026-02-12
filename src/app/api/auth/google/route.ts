// GET /api/auth/google — Redirects to Google OAuth consent screen

import { NextResponse } from "next/server";
import { getOAuthConsentUrl } from "@/lib/calendar";
import { getSession } from "@/lib/admin/auth";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.GOOGLE_OAUTH_CLIENT_ID || !process.env.GOOGLE_OAUTH_CLIENT_SECRET) {
    return NextResponse.json(
      { error: "Google OAuth credentials not configured" },
      { status: 500 }
    );
  }

  const url = getOAuthConsentUrl();
  return NextResponse.redirect(url);
}
