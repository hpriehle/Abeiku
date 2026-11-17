import { describe, expect, it } from "vitest";
import { checkInvite } from "./invite";

const NOW = new Date("2026-11-15T12:00:00Z");
const p = (over: object = {}) => ({ name: "Kofi", password_hash: null, invite_expires_at: "2026-11-20T00:00:00Z", ...over });

describe("checkInvite", () => {
  it("missing token", () => expect(checkInvite("", p(), NOW)).toMatchObject({ valid: false, reason: "missing" }));
  it("unknown or used token", () => expect(checkInvite("t", null, NOW)).toMatchObject({ valid: false, reason: "invalid" }));
  it("expired", () =>
    expect(checkInvite("t", p({ invite_expires_at: "2026-11-01T00:00:00Z" }), NOW)).toMatchObject({
      valid: false,
      reason: "expired",
      message: expect.stringMatching(/ask your hotel/i),
    }));
  it("no expiry: valid until used", () =>
    expect(checkInvite("t", p({ invite_expires_at: null }), new Date("2030-01-01T00:00:00Z"))).toEqual({
      valid: true,
      name: "Kofi",
      reset: false,
    }));
  it("first setup", () => expect(checkInvite("t", p(), NOW)).toEqual({ valid: true, name: "Kofi", reset: false }));
  it("reset of an existing password", () =>
    expect(checkInvite("t", p({ password_hash: "$2b$..." }), NOW)).toEqual({ valid: true, name: "Kofi", reset: true }));
});
