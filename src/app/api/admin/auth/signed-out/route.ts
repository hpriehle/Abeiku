import { NextRequest, NextResponse } from "next/server";
import { checkSessionToken, COOKIE_NAME } from "@/lib/admin/auth";
import { logoutRedirect } from "@/lib/auth/logout";

// The admin layout sends a browser here when its session was ended elsewhere (password reset or
// change). Clears the cookie, then the login page. A link here can't sign anyone out: a session
// that is still good is sent back to the dashboard and keeps its cookie.
export async function GET(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (token && (await checkSessionToken(token)).session) {
    return NextResponse.redirect(new URL("/admin", request.url), 303);
  }
  return logoutRedirect(request, COOKIE_NAME, "/admin/login?signedOut=1");
}
