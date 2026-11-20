import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const logClick = vi.fn(async (_row: Record<string, unknown>) => {});
const hasClickSince = vi.fn(async (_id: string, _ip: string, _since: string) => false);
vi.mock("@/lib/db", () => ({ getHotelBySlug: async () => ({ id: "h1" }) }));
vi.mock("@/lib/db/influencers", () => ({
  getInfluencerBySlug: async () => ({ id: "inf1", redirect_url: "https://aracuya.com/" }),
  logClick: (row: Record<string, unknown>) => logClick(row),
  hasClickSince: (id: string, ip: string, since: string) => hasClickSince(id, ip, since),
}));

import { POST } from "./route";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1";

async function visit(body: Record<string, unknown>) {
  const req = new NextRequest("https://abeiku.test/api/public/referral/aracuya/visit", {
    method: "POST",
    body: JSON.stringify({ slug: "ama", ...body }),
    headers: { "content-type": "application/json", origin: "https://aracuya.com" },
  });
  const res = await POST(req, { params: Promise.resolve({ hotelSlug: "aracuya" }) });
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  logClick.mockClear();
  hasClickSince.mockReset();
  hasClickSince.mockResolvedValue(false);
});

describe("POST /api/public/referral/[hotelSlug]/visit", () => {
  it("logs a click from a person", async () => {
    const res = await visit({ user_agent: IPHONE, ip_hash: "ip1" });
    expect(res).toEqual({ status: 200, body: { redirect_url: "https://aracuya.com/" } });
    expect(logClick).toHaveBeenCalledOnce();
    const since = Date.parse(hasClickSince.mock.calls[0][2]);
    expect(Date.now() - since).toBeGreaterThanOrEqual(30 * 60 * 1000 - 1000);
    expect(Date.now() - since).toBeLessThan(31 * 60 * 1000);
  });

  it.each(["WhatsApp/2.23.20.0 A", "curl/8.5.0", "facebookexternalhit/1.1", "", undefined])(
    "bot %j: same response, no click",
    async (ua) => {
      const res = await visit({ user_agent: ua, ip_hash: "ip1" });
      expect(res).toEqual({ status: 200, body: { redirect_url: "https://aracuya.com/" } });
      expect(logClick).not.toHaveBeenCalled();
    },
  );

  it("repeat visit from the same ip within 30 minutes: same response, no click", async () => {
    hasClickSince.mockResolvedValue(true);
    const res = await visit({ user_agent: IPHONE, ip_hash: "ip1" });
    expect(res).toEqual({ status: 200, body: { redirect_url: "https://aracuya.com/" } });
    expect(hasClickSince).toHaveBeenCalledWith("inf1", "ip1", expect.any(String));
    expect(logClick).not.toHaveBeenCalled();
  });

  it("no ip_hash: still counts (cannot tell repeats apart)", async () => {
    await visit({ user_agent: IPHONE });
    expect(hasClickSince).not.toHaveBeenCalled();
    expect(logClick).toHaveBeenCalledOnce();
  });
});
