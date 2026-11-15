import { COOKIE_NAME } from "@/lib/partner/auth";
import { logoutRedirect } from "@/lib/auth/logout";

// The "Log out" button is a plain form POST: clear the cookie and land on the login page.
export async function POST(request: Request) {
  return logoutRedirect(request, COOKIE_NAME, "/partner/login");
}
