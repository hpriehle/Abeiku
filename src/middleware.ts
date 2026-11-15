import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth/session";

const COOKIE_NAME = "admin_session";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only protect /admin routes (except /admin/login)
  if (!pathname.startsWith("/admin") || pathname === "/admin/login") {
    return NextResponse.next();
  }

  const sessionCookie = request.cookies.get(COOKIE_NAME);
  // Only an admin session opens /admin: a partner session signed with the same key does not.
  if (sessionCookie?.value && (await verifySession(sessionCookie.value, "admin"))) {
    return NextResponse.next();
  }
  return NextResponse.redirect(new URL("/admin/login", request.url));
}

export const config = {
  matcher: "/admin/:path*",
};
