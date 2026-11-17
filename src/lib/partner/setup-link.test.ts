import { beforeEach, describe, expect, it, vi } from "vitest";

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (n: string) => (jar.has(n) ? { name: n, value: jar.get(n)! } : undefined) }),
}));
const db = vi.hoisted(() => ({
  partner: null as null | { id: string; hotel_id: string; password_hash: string | null },
  setInfluencerInvite: vi.fn(async () => {}),
  setInfluencerResetInvite: vi.fn(async () => {}),
}));
vi.mock("@/lib/db/influencers", () => ({
  getInfluencerById: vi.fn(async () => db.partner),
  setInfluencerInvite: db.setInfluencerInvite,
  setInfluencerResetInvite: db.setInfluencerResetInvite,
}));
vi.mock("@/lib/db", () => ({ getHotelById: vi.fn(async () => null) }));

import { POST } from "@/app/api/admin/influencers/[id]/setup-link/route";
import { createSessionToken } from "@/lib/admin/auth";

const call = () => POST(new Request("http://x", { method: "POST" }), { params: Promise.resolve({ id: "p1" }) });
const DAY = 24 * 60 * 60 * 1000;

beforeEach(async () => {
  vi.clearAllMocks();
  jar.set("admin_session", await createSessionToken({ userId: "u", hotelId: "h1", email: "a@x", hotelName: "H", role: "admin" }));
});

describe("POST /api/admin/influencers/[id]/setup-link", () => {
  it("first setup link: valid until used (no expiry)", async () => {
    db.partner = { id: "p1", hotel_id: "h1", password_hash: null };
    const res = await call();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ reset: false, setup_url: expect.stringContaining("/partner/setup?token=") });
    expect(body.setup_expires_at).toBeNull();
    expect(db.setInfluencerInvite).toHaveBeenCalledWith("p1", expect.any(String), null);
  });

  it("partner with a password gets a reset link (was 409), 3 days", async () => {
    db.partner = { id: "p1", hotel_id: "h1", password_hash: "$2b$hash" };
    const res = await call();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.reset).toBe(true);
    expect(new Date(body.setup_expires_at).getTime() - Date.now()).toBeLessThan(3 * DAY + 1000);
    expect(db.setInfluencerResetInvite).toHaveBeenCalledOnce();
    expect(db.setInfluencerInvite).not.toHaveBeenCalled();
  });

  it("partner of another hotel: 404", async () => {
    db.partner = { id: "p1", hotel_id: "other", password_hash: null };
    expect((await call()).status).toBe(404);
  });
});
