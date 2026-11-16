import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth/session";
import { blockedAdminApiAllowed } from "@/lib/billing/access";

const COOKIE_NAME = "admin_session";

type AdminClaims = { billing?: string };

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const cookie = request.cookies.get(COOKIE_NAME)?.value;

  // /api/admin: each route checks the session itself. Here only: a hotel that signed up but has
  // no card on file (session claim billing=blocked) can't use the admin API.
  if (pathname.startsWith("/api/admin")) {
    if (!cookie || blockedAdminApiAllowed(pathname)) return NextResponse.next();
    const session = await verifySession<AdminClaims>(cookie, "admin");
    if (session?.billing === "blocked") {
      return NextResponse.json({ error: "Finish signing up to use this. Add your card to start your free trial." }, { status: 402 });
    }
    return NextResponse.next();
  }

  // Only protect /admin routes (except /admin/login)
  if (!pathname.startsWith("/admin") || pathname === "/admin/login") {
    return NextResponse.next();
  }

  // Only an admin session opens /admin: a partner session signed with the same key does not.
  const session = cookie ? await verifySession<AdminClaims>(cookie, "admin") : null;
  if (session) {
    if (session.billing === "blocked") return NextResponse.redirect(new URL("/signup", request.url));
    return NextResponse.next();
  }
  return NextResponse.redirect(new URL("/admin/login", request.url));
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
