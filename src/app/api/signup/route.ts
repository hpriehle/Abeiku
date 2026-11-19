// POST /api/signup: step 1 of self-serve sign-up. Creates the hotel and its admin login.
//
// L2: the hotel starts in billing_status "pending_card" and the session carries billing=blocked,
// so the admin stays closed until a card is on file (see src/lib/billing). Closed (404) unless
// SIGNUP_OPEN=true, and refuses (503) until docs/l2-signup/billing.sql has run, so no account can
// ever be created without the billing step.

import { NextRequest, NextResponse } from "next/server";
import { createHotel, createAdminUser, getAdminUserByEmail, getHotelBySlug, seedDefaultNotificationPreferences } from "@/lib/db";
import { hashPassword } from "@/lib/admin/auth";
import { supabase } from "@/lib/supabase/client";
import { signupOpen } from "@/lib/billing";
import { billingView } from "@/lib/billing/access";
import { setAdminSession } from "@/lib/billing/session";
import { isMissingColumnError } from "@/lib/billing/store";
import { parseAccount, slugify } from "@/lib/billing/signup-input";
import { recordTermsAccepted } from "@/lib/billing/terms";
import { createConfirmToken, getConfirmStore } from "@/lib/auth/email-confirm";
import { verifyEmailMessage } from "@/lib/auth/account-emails";
import { sendEmail } from "@/lib/notifications/email";
import { checkLimit, clientIp, getAttemptStore, hashKey, recordFailure, tooManyMessage } from "@/lib/auth/rate-limit";

const SIGNUP_LIMIT = { max: 5, windowMs: 60 * 60 * 1000 };

async function billingColumnsReady(): Promise<boolean> {
  const { error } = await supabase.from("hotels").select("billing_status, billing_exempt, room_count, calendar_links").limit(1);
  if (!error) return true;
  if (isMissingColumnError(error)) return false;
  throw error;
}

async function sendVerifyEmail(userId: string, email: string): Promise<void> {
  try {
    const token = await createConfirmToken(await getConfirmStore(), userId, email, "verify");
    const result = await sendEmail({ to: email, ...verifyEmailMessage(token) });
    if (!result.success) console.error("[signup] confirm email failed:", result.error);
  } catch (err) {
    console.error("[signup] could not create confirm link (run docs/go-live-l3-account.sql?):", (err as Error).message);
  }
}

export async function POST(request: NextRequest) {
  if (!signupOpen()) {
    return NextResponse.json({ error: "Sign-up is not open yet." }, { status: 404 });
  }
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const parsed = parseAccount(body);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const { hotelName, email, password } = parsed.value;

    // At most 5 new accounts per hour from one address.
    const store = await getAttemptStore();
    const keys = [`signup:ip:${hashKey(clientIp(request.headers))}`];
    const check = await checkLimit(store, keys, SIGNUP_LIMIT);
    if (!check.allowed) {
      return NextResponse.json({ error: tooManyMessage(check.retryAfterSec) }, { status: 429 });
    }

    if (!(await billingColumnsReady())) {
      console.error("[signup] billing columns missing: run docs/l2-signup/billing.sql");
      return NextResponse.json({ error: "Sign-up is not ready yet. Please try again later." }, { status: 503 });
    }

    if (await getAdminUserByEmail(email)) {
      return NextResponse.json({ error: "An account with this email already exists. Log in instead." }, { status: 409 });
    }

    const base = slugify(hotelName);
    let slug = base;
    for (let attempt = 1; await getHotelBySlug(slug); attempt++) slug = `${base}-${attempt}`;

    const hotel = await createHotel({
      name: hotelName,
      slug,
      contact_email: email,
      location_country: "Ghana",
      currency: "GHS",
      billing_status: "pending_card",
    });

    const user = await createAdminUser({
      hotel_id: hotel.id,
      email,
      password_hash: await hashPassword(password),
      name: hotelName,
      role: "admin",
    });
    await recordFailure(store, keys); // counts successful sign-ups toward the hourly limit

    // parseAccount refused the request unless the Terms box was ticked; keep when.
    await recordTermsAccepted(hotel.id, new Date());

    try {
      await seedDefaultNotificationPreferences(hotel.id);
    } catch (err) {
      console.error("[signup] notification defaults failed:", err);
    }

    // L3: confirm the login email. Never blocks sign-up; the admin banner nags until it's done.
    await sendVerifyEmail(user.id, user.email);

    const res = NextResponse.json({ success: true, next: "hotel" });
    return setAdminSession(
      res,
      { userId: user.id, hotelId: hotel.id, email: user.email, hotelName: hotel.name, role: user.role, sv: 0 },
      billingView({ billing_status: "pending_card" })
    );
  } catch (error) {
    console.error("Signup error:", error);
    return NextResponse.json({ error: "We could not create your account. Please try again." }, { status: 500 });
  }
}
