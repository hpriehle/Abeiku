import { NextRequest, NextResponse } from "next/server";
import { getAdminUserByEmail, getAdminUserById } from "@/lib/db";
import { getSession, verifyPassword } from "@/lib/admin/auth";
import { normaliseEmail } from "@/lib/auth/account";
import { createConfirmToken, getConfirmStore } from "@/lib/auth/email-confirm";
import { changeEmailMessage } from "@/lib/auth/account-emails";
import { sendEmail } from "@/lib/notifications/email";
import {
  getAttemptStore,
  checkLimit,
  recordFailure,
  clientIp,
  hashKey,
  loginKeys,
  tooManyMessage,
  LOGIN_LIMIT,
  RESET_REQUEST_ACCOUNT_LIMIT,
} from "@/lib/auth/rate-limit";

// POST /api/admin/account/email: ask to change the login email. Needs the current password.
// Sends a confirm link to the new address; the login email only changes when it is opened
// (POST /api/admin/auth/confirm-email), and then the old address is told.
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Please log in again." }, { status: 401 });

  let body: { newEmail?: unknown; currentPassword?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const newEmail = normaliseEmail(body.newEmail);
  if (!newEmail) return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  if (typeof body.currentPassword !== "string" || !body.currentPassword) {
    return NextResponse.json({ error: "Please enter your current password." }, { status: 400 });
  }

  try {
    const store = await getAttemptStore();
    const pwKeys = loginKeys("admin", clientIp(request.headers), session.email);
    const sendKey = `admin-email-change:${hashKey(session.userId)}`;
    const [pwCheck, sendCheck] = await Promise.all([
      checkLimit(store, pwKeys, LOGIN_LIMIT),
      checkLimit(store, [sendKey], RESET_REQUEST_ACCOUNT_LIMIT),
    ]);
    if (!pwCheck.allowed || !sendCheck.allowed) {
      const retryAfterSec = Math.max(pwCheck.retryAfterSec, sendCheck.retryAfterSec);
      return NextResponse.json(
        { error: tooManyMessage(retryAfterSec) },
        { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
      );
    }

    const user = await getAdminUserById(session.userId);
    if (!user) return NextResponse.json({ error: "Please log in again." }, { status: 401 });
    if (!(await verifyPassword(body.currentPassword, user.password_hash))) {
      await recordFailure(store, pwKeys);
      return NextResponse.json({ error: "Your current password isn't right." }, { status: 400 });
    }
    if (newEmail === user.email.toLowerCase()) {
      return NextResponse.json({ error: "That's already your login email." }, { status: 400 });
    }
    const other = await getAdminUserByEmail(newEmail);
    if (other && other.id !== user.id) {
      return NextResponse.json({ error: "That email already has an Abeiku account." }, { status: 409 });
    }

    await recordFailure(store, [sendKey]); // every link sent counts: 3 per hour
    const token = await createConfirmToken(await getConfirmStore(), user.id, newEmail, "change");
    const mail = await sendEmail({ to: newEmail, ...changeEmailMessage(token) });
    if (!mail.success) {
      console.error("[account/email] confirm email failed:", mail.error);
      return NextResponse.json({ error: "We couldn't send the email. Please try again in a moment." }, { status: 502 });
    }
    return NextResponse.json({
      success: true,
      message: `We sent a link to ${newEmail}. Your login email changes when you open it.`,
    });
  } catch (err) {
    console.error("[account/email] failed:", (err as Error).message);
    return NextResponse.json({ error: "Something went wrong on our side. Please try again in a moment." }, { status: 500 });
  }
}
