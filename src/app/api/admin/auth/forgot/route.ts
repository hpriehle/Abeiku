import { NextRequest, NextResponse } from "next/server";
import { getAdminUserByEmail } from "@/lib/db";
import { sendEmail } from "@/lib/notifications/email";
import {
  getAttemptStore,
  checkLimit,
  recordFailure,
  clientIp,
  resetRequestKeys,
  tooManyMessage,
  RESET_REQUEST_IP_LIMIT,
  RESET_REQUEST_ACCOUNT_LIMIT,
} from "@/lib/auth/rate-limit";
import { createResetToken, getResetStore, SENT_MESSAGE } from "@/lib/auth/password-reset";
import { resetRequestEmail } from "@/lib/auth/password-reset-emails";

export async function POST(request: NextRequest) {
  let email = "";
  try {
    const body = await request.json();
    email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (!email || !email.includes("@") || email.length > 254) {
    return NextResponse.json({ error: "Please enter your email address." }, { status: 400 });
  }

  // Every request counts: 10 per 15 minutes per IP, 3 per hour per email.
  const store = await getAttemptStore();
  const keys = resetRequestKeys(clientIp(request.headers), email);
  const [ipCheck, acctCheck] = await Promise.all([
    checkLimit(store, [keys.ip], RESET_REQUEST_IP_LIMIT),
    checkLimit(store, [keys.account], RESET_REQUEST_ACCOUNT_LIMIT),
  ]);
  if (!ipCheck.allowed || !acctCheck.allowed) {
    const retryAfterSec = Math.max(ipCheck.retryAfterSec, acctCheck.retryAfterSec);
    return NextResponse.json(
      { error: tooManyMessage(retryAfterSec) },
      { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
    );
  }
  await recordFailure(store, [keys.ip, keys.account]);

  try {
    const user = await getAdminUserByEmail(email);
    if (user) {
      const token = await createResetToken(await getResetStore(), user.id);
      const result = await sendEmail({ to: user.email, ...resetRequestEmail(token) });
      if (!result.success) console.error("[forgot-password] email failed:", result.error);
    }
  } catch (err) {
    // Logged only: the answer must not tell anyone whether the email exists.
    console.error("[forgot-password] could not create reset:", (err as Error).message);
  }

  return NextResponse.json({ success: true, message: SENT_MESSAGE });
}
