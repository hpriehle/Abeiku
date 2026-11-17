import { NextRequest, NextResponse } from "next/server";
import { getHotelById } from "@/lib/db";
import { supabaseAccountStore } from "@/lib/db/partner-accounts";
import { confirmPartnerEmail } from "@/lib/partner/signup";
import { signupDeps } from "@/lib/partner/signup-deps";
import { createPartnerSessionToken, getPartnerSessionCookieOptions, sessionPayloadFor } from "@/lib/partner/auth";

// The confirm link from the sign-up email (once only). Signs the partner in.
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { token?: unknown } | null;
  try {
    const r = await confirmPartnerEmail(body?.token, await signupDeps());
    if (!r.ok) return NextResponse.json({ error: r.error, problem: r.problem }, { status: r.status });

    const hotel = r.membership ? await getHotelById(r.membership.hotel_id) : null;
    const token = await createPartnerSessionToken(
      sessionPayloadFor(r.account, hotel ? r.membership : null, hotel?.slug ?? "")
    );
    await supabaseAccountStore.markAccountLogin(r.account.id);
    const { name, options } = getPartnerSessionCookieOptions();
    const response = NextResponse.json({ success: true });
    response.cookies.set(name, token, options);
    return response;
  } catch (err) {
    console.error("[partner-confirm] failed:", (err as Error).message);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
