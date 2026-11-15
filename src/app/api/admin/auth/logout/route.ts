import { COOKIE_NAME } from "@/lib/admin/auth";
import { logoutRedirect } from "@/lib/auth/logout";

// The sidebar "Log out" button is a plain form POST: clear the cookie and land on the login page.
export async function POST(request: Request) {
  return logoutRedirect(request, COOKIE_NAME, "/admin/login");
}
