// Signing and verifying the admin and partner session cookies. Pure (no next/headers), so the
// middleware, the route helpers and the tests share one implementation.
//
// Both kinds are signed with JWT_SECRET, so every token carries a `typ` claim and each side only
// accepts its own kind: a partner token in the admin cookie is rejected, and the other way round.

import { SignJWT, jwtVerify, type JWTPayload } from "jose";

export type SessionKind = "admin" | "partner";

const SESSION_TTL = "7d";

function secretKey(): Uint8Array {
  return new TextEncoder().encode(process.env.JWT_SECRET || "dev-secret-change-me");
}

/**
 * The kind of a verified payload. Tokens issued before the `typ` claim existed (at most 7 days
 * old) are told apart by shape: only partner tokens have `influencerId`, only admin tokens have
 * `userId`. A token with both, or neither, is rejected.
 */
export function sessionKindOf(payload: JWTPayload): SessionKind | null {
  const hasPartnerId = typeof payload.influencerId === "string";
  const hasUserId = typeof payload.userId === "string";
  if (payload.typ === "admin") return hasUserId && !hasPartnerId ? "admin" : null;
  if (payload.typ === "partner") return hasPartnerId && !hasUserId ? "partner" : null;
  if (payload.typ !== undefined) return null;
  if (hasPartnerId && !hasUserId) return "partner";
  if (hasUserId && !hasPartnerId) return "admin";
  return null;
}

export async function signSession(kind: SessionKind, payload: object): Promise<string> {
  return new SignJWT({ ...payload, typ: kind })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(SESSION_TTL)
    .sign(secretKey());
}

/** The payload if `token` is a valid, unexpired session of `kind`; otherwise null. */
export async function verifySession<T>(token: string, kind: SessionKind): Promise<T | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    return sessionKindOf(payload) === kind ? (payload as unknown as T) : null;
  } catch {
    return null;
  }
}
