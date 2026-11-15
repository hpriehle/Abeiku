// Same token shape as signSession() in src/lib/auth/session.ts, short-lived, for local screenshots only.
import { SignJWT } from "jose";

export function signSessionLocal(secret, kind, payload) {
  return new SignJWT({ ...payload, typ: kind })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(secret));
}
