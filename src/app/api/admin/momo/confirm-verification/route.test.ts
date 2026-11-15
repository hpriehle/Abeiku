import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { MemoryAttemptStore } from "@/lib/auth/rate-limit";

let store = new MemoryAttemptStore();
vi.mock("@/lib/auth/rate-limit", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/rate-limit")>()),
  getAttemptStore: async () => store,
}));
vi.mock("@/lib/admin/auth", () => ({ getSession: async () => ({ hotelId: "h1" }) }));

type H = Record<string, unknown>;
let hotel: H;
const updateHotel = vi.fn(async (_id: string, u: H) => {
  hotel = { ...hotel, ...u };
});
vi.mock("@/lib/db", () => ({
  getHotelById: async () => hotel,
  updateHotel: (id: string, u: H) => updateHotel(id, u),
}));

const { POST } = await import("./route");

function confirm(amount: string) {
  return POST(
    new NextRequest("http://localhost/api/admin/momo/confirm-verification", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amount }),
    })
  );
}

describe("MoMo verification attempt limit (F2 item 5)", () => {
  beforeEach(() => {
    store = new MemoryAttemptStore();
    updateHotel.mockClear();
    hotel = {
      id: "h1",
      momo_phone_verified: false,
      momo_verification_amount: 37,
      momo_verification_ref: "ref-1",
      momo_verification_sent_at: new Date().toISOString(),
    };
  });

  it("counts down and cancels the check after 5 wrong amounts", async () => {
    for (let i = 4; i >= 1; i--) {
      const res = await confirm("0.10");
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.verified).toBe(false);
      expect(body.error).toContain(`${i} ${i === 1 ? "try" : "tries"} left`);
    }
    const fifth = await confirm("0.11");
    expect(fifth.status).toBe(429);
    expect(hotel.momo_verification_amount).toBeNull(); // must send a new verification
    // even the right amount no longer works for this cancelled check
    const after = await confirm("0.37");
    expect(after.status).toBe(400);
    expect(hotel.momo_phone_verified).toBe(false);
  });

  it("the right amount within the limit verifies", async () => {
    await confirm("0.10");
    const res = await confirm("0.37");
    expect(await res.json()).toEqual({ verified: true });
    expect(hotel.momo_phone_verified).toBe(true);
  });
});
