import { cookies } from "next/headers";
import { signSession, verifySession } from "@/lib/auth/session";
import bcrypt from "bcryptjs";

const COOKIE_NAME = "partner_session";

export interface PartnerSessionPayload {
  influencerId: string;
  hotelId: string;
  hotelSlug: string;
  email: string;
  name: string;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createPartnerSessionToken(payload: PartnerSessionPayload): Promise<string> {
  return signSession("partner", payload);
}

/** Only accepts partner sessions (see src/lib/auth/session.ts). */
export async function verifyPartnerSessionToken(token: string): Promise<PartnerSessionPayload | null> {
  return verifySession<PartnerSessionPayload>(token, "partner");
}

export async function getPartnerSession(): Promise<PartnerSessionPayload | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(COOKIE_NAME);
  if (!sessionCookie?.value) return null;
  return verifyPartnerSessionToken(sessionCookie.value);
}

export function getPartnerSessionCookieOptions() {
  return {
    name: COOKIE_NAME,
    options: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    },
  };
}

export { COOKIE_NAME };
