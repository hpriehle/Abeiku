import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth/session";
import { loadBillingView } from "@/lib/billing";
import { ADMIN_PATH_HEADER, blockedAdminApiAllowed, lockedAdminApiAllowed } from "@/lib/billing/access";

const COOKIE_NAME = "admin_session";

type AdminClaims = { billing?: string; hotelId?: string; role?: string };

const PUBLIC_ADMIN_PAGES = new Set(["/admin/login", "/admin/forgot-password", "/admin/reset-password"]);

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
    // Past due over 14 days: the pages are locked to /admin/plan by the layout, the API here.
    if (session?.hotelId && session.role !== "platform_admin" && !lockedAdminApiAllowed(pathname)) {
      if ((await loadBillingView(session.hotelId)).access === "locked") {
        return NextResponse.json({ error: "billing_locked" }, { status: 402 });
      }
    }
    return NextResponse.next();
  }

  // Only protect /admin routes (except the signed-out pages: login and forgot/reset password)
  if (!pathname.startsWith("/admin") || PUBLIC_ADMIN_PAGES.has(pathname)) {
    return NextResponse.next();
  }

  // Only an admin session opens /admin: a partner session signed with the same key does not.
  const session = cookie ? await verifySession<AdminClaims>(cookie, "admin") : null;
  if (session) {
    if (session.billing === "blocked") return NextResponse.redirect(new URL("/signup", request.url));
    // The admin layout needs the path to lock a past-due hotel to /admin/plan.
    const headers = new Headers(request.headers);
    headers.set(ADMIN_PATH_HEADER, pathname);
    return NextResponse.next({ request: { headers } });
  }
  return NextResponse.redirect(new URL("/admin/login", request.url));
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
