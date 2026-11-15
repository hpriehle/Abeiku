import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";

// Cookie jar read by next/headers cookies() in the route handlers under test.
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
  }),
}));
// No database: these tests only exercise the session checks in front of it.
vi.mock("@/lib/db", () => ({
  getPaymentsForHotel: vi.fn(async () => []),
  getPaymentStats: vi.fn(async () => ({})),
}));
vi.mock("@/lib/db/influencers", () => ({
  getBookingById: vi.fn(async () => null),
  setBookingPayout: vi.fn(),
  getInfluencerById: vi.fn(async () => null),
  listBookingsForInfluencer: vi.fn(async () => []),
}));

import { sessionKindOf, signSession, verifySession } from "./session";
import { createSessionToken, getSession } from "@/lib/admin/auth";
import { createPartnerSessionToken, getPartnerSession } from "@/lib/partner/auth";
import { middleware } from "@/middleware";
import { GET as adminPaymentsGET } from "@/app/api/admin/payments/route";
import { POST as adminPayoutPOST } from "@/app/api/admin/influencers/bookings/[id]/payout/route";
import { GET as partnerStatsGET } from "@/app/api/partner/stats/route";

const ADMIN = { userId: "u1", hotelId: "h1", email: "a@x.com", hotelName: "Hotel", role: "admin" };
const PARTNER = { influencerId: "i1", hotelId: "h1", hotelSlug: "aracuya", email: "p@x.com", name: "P" };
const key = () => new TextEncoder().encode(process.env.JWT_SECRET || "dev-secret-change-me");

/** A token as issued before this change: same key, no `typ` claim. */
const legacyToken = (payload: object) =>
  new SignJWT({ ...payload }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("7d").sign(key());

beforeEach(() => jar.clear());

describe("sessionKindOf", () => {
  it("reads the typ claim", () => {
    expect(sessionKindOf({ typ: "admin", userId: "u" })).toBe("admin");
    expect(sessionKindOf({ typ: "partner", influencerId: "i" })).toBe("partner");
  });
  it("rejects a typ that does not match the payload shape", () => {
    expect(sessionKindOf({ typ: "admin", influencerId: "i" })).toBeNull();
    expect(sessionKindOf({ typ: "admin", userId: "u", influencerId: "i" })).toBeNull();
    expect(sessionKindOf({ typ: "other", userId: "u" })).toBeNull();
  });
  it("classifies tokens issued before typ by shape", () => {
    expect(sessionKindOf({ userId: "u", hotelId: "h" })).toBe("admin");
    expect(sessionKindOf({ influencerId: "i", hotelId: "h" })).toBe("partner");
    expect(sessionKindOf({ hotelId: "h" })).toBeNull();
  });
});

describe("verifySession", () => {
  it("accepts its own kind and refuses the other", async () => {
    const a = await signSession("admin", ADMIN);
    const p = await signSession("partner", PARTNER);
    expect(await verifySession(a, "admin")).toMatchObject(ADMIN);
    expect(await verifySession(p, "partner")).toMatchObject(PARTNER);
    expect(await verifySession(p, "admin")).toBeNull();
    expect(await verifySession(a, "partner")).toBeNull();
  });
  it("refuses a token signed with another key", async () => {
    const forged = await new SignJWT({ ...ADMIN, typ: "admin" })
      .setProtectedHeader({ alg: "HS256" })
      .sign(new TextEncoder().encode("not-the-secret"));
    expect(await verifySession(forged, "admin")).toBeNull();
  });
});

describe("admin APIs refuse partner sessions", () => {
  it("partner token in the admin cookie gets 401 on /api/admin/payments", async () => {
    jar.set("admin_session", await createPartnerSessionToken(PARTNER));
    const res = await adminPaymentsGET(new NextRequest("http://x/api/admin/payments"));
    expect(res.status).toBe(401);
    expect(await getSession()).toBeNull();
  });

  it("legacy partner token (no typ) in the admin cookie also gets 401", async () => {
    jar.set("admin_session", await legacyToken(PARTNER));
    const res = await adminPaymentsGET(new NextRequest("http://x/api/admin/payments"));
    expect(res.status).toBe(401);
  });

  it("partner token cannot mark its own commission paid", async () => {
    jar.set("admin_session", await createPartnerSessionToken(PARTNER));
    const res = await adminPayoutPOST(
      new NextRequest("http://x/api/admin/influencers/bookings/b1/payout", { method: "POST", body: "{}" }),
      { params: Promise.resolve({ id: "b1" }) }
    );
    expect(res.status).toBe(401);
  });

  it("admin token still works (200), including one issued before typ", async () => {
    jar.set("admin_session", await createSessionToken(ADMIN));
    expect((await adminPaymentsGET(new NextRequest("http://x/api/admin/payments"))).status).toBe(200);
    jar.set("admin_session", await legacyToken(ADMIN));
    expect((await adminPaymentsGET(new NextRequest("http://x/api/admin/payments"))).status).toBe(200);
  });
});

describe("partner APIs refuse admin sessions", () => {
  it("admin token in the partner cookie gets 401 on /api/partner/stats", async () => {
    jar.set("partner_session", await createSessionToken(ADMIN));
    expect((await partnerStatsGET()).status).toBe(401);
    expect(await getPartnerSession()).toBeNull();
  });
});

describe("middleware", () => {
  const req = (cookie?: string) =>
    new NextRequest("http://x/admin/dashboard", { headers: cookie ? { cookie: `admin_session=${cookie}` } : {} });
  const isRedirectToLogin = (res: Response) =>
    res.status === 307 && new URL(res.headers.get("location")!).pathname === "/admin/login";

  it("sends a partner session in the admin cookie to /admin/login", async () => {
    expect(isRedirectToLogin(await middleware(req(await createPartnerSessionToken(PARTNER))))).toBe(true);
    expect(isRedirectToLogin(await middleware(req(await legacyToken(PARTNER))))).toBe(true);
    expect(isRedirectToLogin(await middleware(req()))).toBe(true);
  });
  it("lets an admin session through", async () => {
    const res = await middleware(req(await createSessionToken(ADMIN)));
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });
});
