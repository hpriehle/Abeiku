import { NextRequest, NextResponse } from "next/server";
import { getAdminUserById, setAdminUserPassword } from "@/lib/db";
import { hashPassword } from "@/lib/admin/auth";
import { sendEmail } from "@/lib/notifications/email";
import { getAttemptStore, clearKeys, loginKeys } from "@/lib/auth/rate-limit";
import {
  checkResetToken,
  consumeResetToken,
  getResetStore,
  passwordProblem,
  tokenProblemMessage,
} from "@/lib/auth/password-reset";
import { passwordChangedEmail } from "@/lib/auth/password-reset-emails";

export async function POST(request: NextRequest) {
  let token: unknown;
  let password: unknown;
  try {
    ({ token, password } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (typeof token !== "string" || !token) {
    return NextResponse.json({ error: tokenProblemMessage("invalid"), linkProblem: "invalid" }, { status: 400 });
  }
  const pwProblem = passwordProblem(password);
  if (pwProblem) return NextResponse.json({ error: pwProblem }, { status: 400 });

  try {
    const store = await getResetStore();
    // Check first so a bad link doesn't cost a bcrypt hash; then use it (single use, race-safe).
    const check = await checkResetToken(store, token);
    if (!check.ok) {
      return NextResponse.json({ error: tokenProblemMessage(check.problem), linkProblem: check.problem }, { status: 400 });
    }
    const passwordHash = await hashPassword(password as string);
    const used = await consumeResetToken(store, token);
    if (!used.ok) {
      return NextResponse.json({ error: tokenProblemMessage(used.problem), linkProblem: used.problem }, { status: 400 });
    }

    await setAdminUserPassword(used.adminUserId, passwordHash);

    const user = await getAdminUserById(used.adminUserId);
    if (user) {
      // Unlock the account if it was locked by failed logins (the IP counter is left alone).
      await clearKeys(await getAttemptStore(), [loginKeys("admin", "", user.email)[1]]);
      const result = await sendEmail({ to: user.email, ...passwordChangedEmail() });
      if (!result.success) console.error("[reset-password] changed email failed:", result.error);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[reset-password] failed:", (err as Error).message);
    return NextResponse.json(
      { error: "Something went wrong. Please try again, or ask for a new link." },
      { status: 500 }
    );
  }
}
