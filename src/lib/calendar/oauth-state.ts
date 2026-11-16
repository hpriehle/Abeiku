// OAuth `state` for the Google Calendar connect flow (audit B8: login CSRF).
// The start route puts a random nonce in `state` and in an httpOnly cookie
// bound to the hotel; the callback only accepts a code when both match.

import { randomBytes, timingSafeEqual } from "crypto";

export const OAUTH_STATE_COOKIE = "g_oauth_state";
export const OAUTH_STATE_MAX_AGE = 10 * 60; // seconds

export function createOAuthState(hotelId: string): { state: string; cookieValue: string } {
  const state = randomBytes(24).toString("base64url");
  return { state, cookieValue: `${state}.${hotelId}` };
}

export function verifyOAuthState(
  stateParam: string | null | undefined,
  cookieValue: string | null | undefined,
  hotelId: string
): boolean {
  if (!stateParam || !cookieValue) return false;
  const dot = cookieValue.indexOf(".");
  if (dot <= 0) return false;
  const expected = cookieValue.slice(0, dot);
  const cookieHotel = cookieValue.slice(dot + 1);
  if (cookieHotel !== hotelId) return false;
  const a = Buffer.from(stateParam);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function stateCookieOptions(maxAge = OAUTH_STATE_MAX_AGE) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const, // must survive the top-level redirect back from Google
    path: "/api/auth/google",
    maxAge,
  };
}
