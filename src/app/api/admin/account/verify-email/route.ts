import { NextResponse } from "next/server";
import { getAdminUserById } from "@/lib/db";
import { getSession } from "@/lib/admin/auth";
import { getAccountDb, readAccountState } from "@/lib/auth/account";
import { createConfirmToken, getConfirmStore } from "@/lib/auth/email-confirm";
import { verifyEmailMessage } from "@/lib/auth/account-emails";
import { sendEmail } from "@/lib/notifications/email";
import {
  getAttemptStore,
  checkLimit,
  recordFailure,
  hashKey,
  tooManyMessage,
  RESET_REQUEST_ACCOUNT_LIMIT,
} from "@/lib/auth/rate-limit";

// POST /api/admin/account/verify-email: the banner's "Resend" button. 3 emails per hour.
export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Please log in again." }, { status: 401 });

  try {
    const state = await readAccountState(await getAccountDb(), session.userId);
    if (state.emailVerified !== false) return NextResponse.json({ success: true, alreadyConfirmed: true });

    const store = await getAttemptStore();
    const key = `admin-verify-email:${hashKey(session.userId)}`;
    const limit = await checkLimit(store, [key], RESET_REQUEST_ACCOUNT_LIMIT);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: tooManyMessage(limit.retryAfterSec) },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } }
      );
    }

    const user = await getAdminUserById(session.userId);
    if (!user) return NextResponse.json({ error: "Please log in again." }, { status: 401 });

    await recordFailure(store, [key]);
    const token = await createConfirmToken(await getConfirmStore(), user.id, user.email, "verify");
    const mail = await sendEmail({ to: user.email, ...verifyEmailMessage(token) });
    if (!mail.success) {
      console.error("[account/verify-email] email failed:", mail.error);
      return NextResponse.json({ error: "We couldn't send the email. Please try again in a moment." }, { status: 502 });
    }
    return NextResponse.json({ success: true, message: `We sent a new link to ${user.email}.` });
  } catch (err) {
    console.error("[account/verify-email] failed:", (err as Error).message);
    return NextResponse.json({ error: "Something went wrong on our side. Please try again in a moment." }, { status: 500 });
  }
}
