import { describe, it, expect, vi } from "vitest";
import {
  checkLimit,
  recordFailure,
  clearKeys,
  clientIp,
  loginKeys,
  hashKey,
  tooManyMessage,
  MemoryAttemptStore,
  FallbackAttemptStore,
  LOGIN_LIMIT,
  type AttemptStore,
} from "./rate-limit";

const T0 = 1_700_000_000_000;

describe("checkLimit / recordFailure", () => {
  it("allows 10 failures, blocks the 11th try for 15 minutes", async () => {
    const store = new MemoryAttemptStore();
    const keys = loginKeys("admin", "1.2.3.4", "owner@hotel.com");
    for (let i = 0; i < 10; i++) {
      expect((await checkLimit(store, keys, LOGIN_LIMIT, T0 + i * 1000)).allowed).toBe(true);
      await recordFailure(store, keys, T0 + i * 1000);
    }
    const blocked = await checkLimit(store, keys, LOGIN_LIMIT, T0 + 10_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBe(15 * 60 - 10);
    // after the window has passed for the oldest attempts it opens again
    expect((await checkLimit(store, keys, LOGIN_LIMIT, T0 + 15 * 60 * 1000 + 1000)).allowed).toBe(true);
  });

  it("limits per account even when the IP changes", async () => {
    const store = new MemoryAttemptStore();
    for (let i = 0; i < 10; i++) await recordFailure(store, loginKeys("admin", `10.0.0.${i}`, "Owner@Hotel.com"), T0);
    const fresh = await checkLimit(store, loginKeys("admin", "9.9.9.9", "owner@hotel.com "), LOGIN_LIMIT, T0 + 1);
    expect(fresh.allowed).toBe(false);
  });

  it("limits per IP across accounts", async () => {
    const store = new MemoryAttemptStore();
    for (let i = 0; i < 10; i++) await recordFailure(store, loginKeys("partner", "5.5.5.5", `p${i}@x.com`), T0);
    expect((await checkLimit(store, loginKeys("partner", "5.5.5.5", "new@x.com"), LOGIN_LIMIT, T0)).allowed).toBe(false);
    // admin scope is separate
    expect((await checkLimit(store, loginKeys("admin", "5.5.5.5", "new@x.com"), LOGIN_LIMIT, T0)).allowed).toBe(true);
  });

  it("a successful login clears the account counter", async () => {
    const store = new MemoryAttemptStore();
    const keys = loginKeys("admin", "1.1.1.1", "a@b.c");
    for (let i = 0; i < 9; i++) await recordFailure(store, keys, T0);
    await clearKeys(store, [keys[1]]);
    expect(await store.recent(keys[1], 0)).toEqual([]);
    expect((await store.recent(keys[0], 0)).length).toBe(9);
  });

  it("never stores the email in clear", () => {
    const [, acct] = loginKeys("admin", "1.1.1.1", "owner@hotel.com");
    expect(acct).not.toContain("owner");
    expect(acct).toBe(`admin:acct:${hashKey("OWNER@hotel.com")}`);
  });
});

describe("FallbackAttemptStore", () => {
  it("keeps limiting in memory when Supabase fails (e.g. table not migrated yet)", async () => {
    const broken: AttemptStore = {
      recent: vi.fn(async () => {
        throw new Error('relation "auth_attempts" does not exist');
      }),
      add: vi.fn(async () => {
        throw new Error("down");
      }),
      clear: vi.fn(async () => {
        throw new Error("down");
      }),
    };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const store = new FallbackAttemptStore(broken, new MemoryAttemptStore());
    const keys = loginKeys("admin", "1.2.3.4", "x@y.z");
    for (let i = 0; i < 10; i++) await recordFailure(store, keys, T0);
    expect((await checkLimit(store, keys, LOGIN_LIMIT, T0 + 1)).allowed).toBe(false);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});

describe("clientIp / message", () => {
  it("prefers Netlify's client IP header", () => {
    expect(clientIp(new Headers({ "x-nf-client-connection-ip": "8.8.8.8", "x-forwarded-for": "1.1.1.1" }))).toBe("8.8.8.8");
    expect(clientIp(new Headers({ "x-forwarded-for": "2.2.2.2, 10.0.0.1" }))).toBe("2.2.2.2");
    expect(clientIp(new Headers())).toBe("unknown");
  });
  it("says how long to wait", () => {
    expect(tooManyMessage(61)).toBe("Too many attempts. Please wait 2 minutes and try again.");
    expect(tooManyMessage(5)).toBe("Too many attempts. Please wait 1 minute and try again.");
  });
});
