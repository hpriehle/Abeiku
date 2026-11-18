import { NextRequest, NextResponse } from "next/server";
import { getAdminUserById } from "@/lib/db";
import { getSession, getSessionCookieOptions, reissueSessionToken } from "@/lib/admin/auth";
import { getAccountDb, markEmailVerified, switchLoginEmail } from "@/lib/auth/account";
import { confirmProblemMessage, consumeConfirmToken, getConfirmStore } from "@/lib/auth/email-confirm";
import { emailChangedNotice } from "@/lib/auth/account-emails";
import { sendEmail } from "@/lib/notifications/email";

// POST /api/admin/auth/confirm-email { token }: the /confirm-email page posts the link's token.
// Works signed out (the link may be opened on another device). "verify" confirms the login email;
// "change" switches the login email to the confirmed address and tells the old one.
export async function POST(request: NextRequest) {
  let token: unknown;
  try {
    ({ token } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    const used = await consumeConfirmToken(await getConfirmStore(), token);
    if (!used.ok) {
      return NextResponse.json({ error: confirmProblemMessage(used.problem), linkProblem: used.problem }, { status: 400 });
    }
    const { row } = used;
    const user = await getAdminUserById(row.admin_user_id);
    if (!user) return NextResponse.json({ error: confirmProblemMessage("invalid"), linkProblem: "invalid" }, { status: 400 });
    const db = await getAccountDb();
    const now = new Date().toISOString();

    if (row.purpose === "verify") {
      if (user.email.toLowerCase() !== row.email) {
        return NextResponse.json(
          { error: "This link is for an email you no longer use. Sign in and ask for a new one.", linkProblem: "invalid" },
          { status: 400 }
        );
      }
      await markEmailVerified(db, user.id, now);
      return NextResponse.json({ success: true, kind: "verify", email: user.email });
    }

    const oldEmail = user.email;
    if (await switchLoginEmail(db, user.id, row.email, now) === "taken") {
      return NextResponse.json({ error: "That email already has an Abeiku account.", linkProblem: "invalid" }, { status: 409 });
    }
    if (oldEmail.toLowerCase() !== row.email) {
      const mail = await sendEmail({ to: oldEmail, ...emailChangedNotice(row.email) });
      if (!mail.success) console.error("[confirm-email] old-address notice failed:", mail.error);
    }

    const res = NextResponse.json({ success: true, kind: "change", email: row.email });
    // Signed in as this user here: show the new email right away.
    const session = await getSession();
    if (session?.userId === user.id) {
      const { name, options } = getSessionCookieOptions();
      res.cookies.set(name, await reissueSessionToken(session, { email: row.email }), options);
    }
    return res;
  } catch (err) {
    console.error("[confirm-email] failed:", (err as Error).message);
    return NextResponse.json({ error: "Something went wrong on our side. Please try again in a moment." }, { status: 500 });
  }
}
