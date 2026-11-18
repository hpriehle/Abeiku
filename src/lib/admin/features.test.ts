import { describe, expect, it, vi } from "vitest";

const getHotelById = vi.fn();
vi.mock("@/lib/db", () => ({ getHotelById: (...a: unknown[]) => getHotelById(...a) }));
vi.mock("@/lib/admin/auth", () => ({ getSession: async () => null }));

const { adminFeatures, loadAdminFeatures, whatsappConnected } = await import("./features");

const connected = { whatsapp_access_token: "t", whatsapp_phone_number_id: "123" };

describe("adminFeatures (L3)", () => {
  it("a new hotel without WhatsApp sees neither Communication, Simulator nor Dev", () => {
    expect(adminFeatures({ slug: "new-lodge" }, "admin")).toEqual({ communication: false, simulator: false, devTools: false });
  });

  it("a hotel with its own WhatsApp connected sees Communication, not Simulator or Dev", () => {
    expect(adminFeatures({ slug: "new-lodge", ...connected }, "admin")).toEqual({ communication: true, simulator: false, devTools: false });
  });

  it("a token without a phone number id is not connected", () => {
    expect(whatsappConnected({ whatsapp_access_token: "t", whatsapp_phone_number_id: null })).toBe(false);
  });

  it("exempt hotels (aracuya, test-hotel) see everything, even without their own WhatsApp", () => {
    for (const slug of ["aracuya", "test-hotel"]) {
      expect(adminFeatures({ slug }, "admin")).toEqual({ communication: true, simulator: true, devTools: true });
    }
  });

  it("a platform admin gets Simulator and Dev; Communication still follows the hotel", () => {
    expect(adminFeatures({ slug: "new-lodge" }, "platform_admin")).toEqual({ communication: false, simulator: true, devTools: true });
  });

  it("loadAdminFeatures never throws: a DB error hides hotel features", async () => {
    getHotelById.mockRejectedValueOnce(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await loadAdminFeatures({ hotelId: "h1", role: "admin" })).toEqual({ communication: false, simulator: false, devTools: false });
  });

  it("loadAdminFeatures reads the hotel", async () => {
    getHotelById.mockResolvedValueOnce({ slug: "x", ...connected });
    expect((await loadAdminFeatures({ hotelId: "h1", role: "admin" })).communication).toBe(true);
    expect(getHotelById).toHaveBeenLastCalledWith("h1");
  });
});
