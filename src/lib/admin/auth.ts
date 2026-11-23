import { cookies } from "next/headers";
import { signSession, verifySession } from "@/lib/auth/session";
import { getAccountDb, readAccountState, sessionIsCurrent, type AccountState } from "@/lib/auth/account";
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
  /** Session version (admin_users.session_version) when issued; see src/lib/auth/account.ts. */
  sv?: number;
  /** Platform admin viewing another hotel ("view as"): the hotel to go back to. */
  homeHotelId?: string;
  homeHotelName?: string;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** Signs a session. Without an explicit `sv` it takes the account's current session version. */
export async function createSessionToken(payload: SessionPayload): Promise<string> {
  let sv = payload.sv;
  if (sv === undefined) {
    try {
      sv = (await readAccountState(await getAccountDb(), payload.userId)).sessionVersion ?? 0;
    } catch (err) {
      console.error("[session] could not read session version:", (err as Error).message);
      sv = 0;
    }
  }
  return signSession("admin", { ...payload, sv });
}

/** Only accepts admin sessions (see src/lib/auth/session.ts). */
export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  return verifySession<SessionPayload>(token, "admin");
}

export type SessionRead =
  /** emailVerified: false only when known to be unconfirmed (null if it couldn't be read). */
  | { session: SessionPayload; revoked: false; emailVerified: boolean | null }
  /** revoked: a validly signed cookie that no longer counts (password changed, or user gone). */
  | { session: null; revoked: boolean };

/**
 * Checks a signed token against the account: a session issued before the last password reset or
 * change is refused. If the database can't be read the signature alone decides (logged).
 */
export async function checkSessionToken(token: string): Promise<SessionRead> {
  const payload = await verifySessionToken(token);
  if (!payload) return { session: null, revoked: false };
  let state: AccountState | null = null;
  try {
    state = await readAccountState(await getAccountDb(), payload.userId);
    if (!sessionIsCurrent(payload.sv, state)) return { session: null, revoked: true };
  } catch (err) {
    console.error("[session] could not check session version:", (err as Error).message);
  }
  return { session: payload, revoked: false, emailVerified: state?.emailVerified ?? null };
}

/** A fresh token for the same login, with some claims changed (e.g. the new `sv` or email). */
export async function reissueSessionToken(session: SessionPayload, changes: Partial<SessionPayload>): Promise<string> {
  const { userId, hotelId, email, hotelName, role, billing, sv, homeHotelId, homeHotelName } = { ...session, ...changes };
  const home = homeHotelId ? { homeHotelId, homeHotelName } : {};
  return createSessionToken({ userId, hotelId, email, hotelName, role, ...(billing ? { billing } : {}), sv, ...home });
}

export async function readSession(): Promise<SessionRead> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(COOKIE_NAME);
  if (!sessionCookie?.value) return { session: null, revoked: false };
  return checkSessionToken(sessionCookie.value);
}

export async function getSession(): Promise<SessionPayload | null> {
  return (await readSession()).session;
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
