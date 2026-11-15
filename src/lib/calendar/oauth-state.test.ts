import { describe, it, expect } from "vitest";
import { createOAuthState, verifyOAuthState } from "./oauth-state";

describe("Google OAuth state (F2 item 5)", () => {
  it("accepts the matching state for the same hotel", () => {
    const { state, cookieValue } = createOAuthState("hotel-1");
    expect(state.length).toBeGreaterThanOrEqual(32);
    expect(verifyOAuthState(state, cookieValue, "hotel-1")).toBe(true);
  });
  it("rejects a missing, wrong or foreign state (login CSRF)", () => {
    const { state, cookieValue } = createOAuthState("hotel-1");
    const other = createOAuthState("hotel-1");
    expect(verifyOAuthState(null, cookieValue, "hotel-1")).toBe(false);
    expect(verifyOAuthState(state, null, "hotel-1")).toBe(false);
    expect(verifyOAuthState(other.state, cookieValue, "hotel-1")).toBe(false);
    expect(verifyOAuthState(state, cookieValue, "hotel-2")).toBe(false);
    expect(verifyOAuthState(state, "garbage", "hotel-1")).toBe(false);
  });
});
