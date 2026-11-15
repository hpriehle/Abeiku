import { NextResponse } from "next/server";

/**
 * Logout response for a plain form POST: clears the session cookie and sends the browser to the
 * login page with 303, so it ends on a page (not on raw JSON) and a reload does not re-post.
 */
export function logoutRedirect(request: Request, cookieName: string, loginPath: string): NextResponse {
  const response = NextResponse.redirect(new URL(loginPath, request.url), 303);
  response.cookies.set(cookieName, "", {
    maxAge: 0,
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  });
  return response;
}
