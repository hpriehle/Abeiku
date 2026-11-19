import { NextRequest, NextResponse } from "next/server";
import { getAdminUserById, setAdminUserPassword } from "@/lib/db";
import {
  getSession,
  hashPassword,
  verifyPassword,
  reissueSessionToken,
  getSessionCookieOptions,
} from "@/lib/admin/auth";
import { passwordProblem } from "@/lib/auth/password-reset";
import { passwordChangedEmail } from "@/lib/auth/password-reset-emails";
import { bumpSessionVersion, getAccountDb } from "@/lib/auth/account";
import { sendEmail } from "@/lib/notifications/email";
import {
  getAttemptStore,
  checkLimit,
  recordFailure,
  clientIp,
  loginKeys,
  tooManyMessage,
  LOGIN_LIMIT,
} from "@/lib/auth/rate-limit";

// POST /api/admin/account/password: change the password while signed in. Needs the current one
// (wrong tries count toward the login lockout). Every other session of this login is ended; this
// browser gets a new session so it stays signed in.
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Please log in again." }, { status: 401 });

  let currentPassword: unknown;
  let newPassword: unknown;
  try {
    ({ currentPassword, newPassword } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (typeof currentPassword !== "string" || !currentPassword) {
    return NextResponse.json({ error: "Please enter your current password." }, { status: 400 });
  }
  const problem = passwordProblem(newPassword);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  try {
    const store = await getAttemptStore();
    const keys = loginKeys("admin", clientIp(request.headers), session.email);
    const limit = await checkLimit(store, keys, LOGIN_LIMIT);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: tooManyMessage(limit.retryAfterSec) },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } }
      );
    }

    const user = await getAdminUserById(session.userId);
    if (!user) return NextResponse.json({ error: "Please log in again." }, { status: 401 });
    if (!(await verifyPassword(currentPassword, user.password_hash))) {
      await recordFailure(store, keys);
      return NextResponse.json({ error: "Your current password isn't right." }, { status: 400 });
    }

    await setAdminUserPassword(user.id, await hashPassword(newPassword as string));
    let sv: number | null = null;
    try {
      sv = await bumpSessionVersion(await getAccountDb(), user.id);
    } catch (err) {
      console.error("[account/password] could not end old sessions:", (err as Error).message);
    }

    const mail = await sendEmail({ to: user.email, ...passwordChangedEmail() });
    if (!mail.success) console.error("[account/password] changed email failed:", mail.error);

    const res = NextResponse.json({ success: true });
    if (sv !== null) {
      const { name, options } = getSessionCookieOptions();
      res.cookies.set(name, await reissueSessionToken(session, { sv }), options);
    }
    return res;
  } catch (err) {
    console.error("[account/password] failed:", (err as Error).message);
    return NextResponse.json({ error: "Something went wrong on our side. Please try again in a moment." }, { status: 500 });
  }
}
