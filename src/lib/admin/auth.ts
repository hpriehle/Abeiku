import { cookies } from "next/headers";
import { signSession, verifySession } from "@/lib/auth/session";
import bcrypt from "bcryptjs";

const COOKIE_NAME = "admin_session";

export interface SessionPayload {
  userId: string;
  hotelId: string;
  email: string;
  hotelName: string;
  role: string;
  /** "blocked": signed up but billing not set up (or ended); only the sign-up steps are open. */
  billing?: "blocked";
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return signSession("admin", payload);
}

/** Only accepts admin sessions (see src/lib/auth/session.ts). */
export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  return verifySession<SessionPayload>(token, "admin");
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(COOKIE_NAME);
  if (!sessionCookie?.value) return null;
  return verifySessionToken(sessionCookie.value);
}

export function getSessionCookieOptions() {
  return {
    name: COOKIE_NAME,
    options: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    },
  };
}

export { COOKIE_NAME };
