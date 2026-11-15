import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Fake hotels table: one row, and a switch for "column not there yet" (go-live SQL not run).
let row: Record<string, unknown> = {};
let columnMissing = false;
let otherError: { code: string; message: string } | null = null;
vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    from: () => ({
      update: (patch: Record<string, unknown>) => ({
        eq: async () => {
          if (otherError) return { error: otherError };
          if (columnMissing && "alert_email" in patch) {
            return { error: { code: "PGRST204", message: "Could not find the 'alert_email' column of 'hotels' in the schema cache" } };
          }
          Object.assign(row, patch);
          return { error: null };
        },
      }),
    }),
  },
}));

let session: { hotelId: string } | null = { hotelId: "h1" };
vi.mock("@/lib/admin/auth", () => ({ getSession: async () => session }));
vi.mock("@/lib/billing/route-helpers", async (orig) => ({
  ...(await orig<typeof import("@/lib/billing/route-helpers")>()),
  requireSession: async () => session,
}));

let hotel: Record<string, unknown> = {};
const updateHotel = vi.fn(async (_id: string, patch: Record<string, unknown>) => Object.assign(row, patch));
vi.mock("@/lib/db", () => ({
  getHotelById: async () => hotel,
  updateHotel: (id: string, patch: Record<string, unknown>) => updateHotel(id, patch),
}));

const { parseAlertEmail, alertEmailOf, setHotelAlertEmail } = await import("./alert-email");
const settingsRoute = await import("@/app/api/admin/hotel/alert-email/route");
const signupHotelRoute = await import("@/app/api/signup/hotel/route");

const patchAlert = (body: unknown) =>
  settingsRoute.PATCH(new NextRequest("http://localhost/api/admin/hotel/alert-email", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
const postHotelStep = (body: unknown) =>
  signupHotelRoute.POST(new NextRequest("http://localhost/api/signup/hotel", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

beforeEach(() => {
  row = {};
  columnMissing = false;
  otherError = null;
  session = { hotelId: "h1" };
  hotel = { id: "h1", slug: "busua-inn", billing_status: "pending_card", location_country: null };
  updateHotel.mockClear();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("parseAlertEmail", () => {
  it("one valid address, trimmed and lower case", () => {
    expect(parseAlertEmail("  Front@Inn.GH ")).toEqual({ ok: true, email: "front@inn.gh" });
  });
  it("empty or missing clears it", () => {
    expect(parseAlertEmail("")).toEqual({ ok: true, email: null });
    expect(parseAlertEmail("   ")).toEqual({ ok: true, email: null });
    expect(parseAlertEmail(null)).toEqual({ ok: true, email: null });
  });
  it("rejects bad and multiple addresses", () => {
    expect(parseAlertEmail("not an email")).toEqual({ ok: false, error: "Enter a valid email address." });
    expect(parseAlertEmail("a@inn.gh, b@inn.gh")).toEqual({ ok: false, error: "Enter one email address only." });
    expect(parseAlertEmail("a@inn.gh;b@inn.gh")).toEqual({ ok: false, error: "Enter one email address only." });
    expect(parseAlertEmail("a@inn.gh b@inn.gh").ok).toBe(false);
    expect(parseAlertEmail(42).ok).toBe(false);
  });
});

describe("alertEmailOf", () => {
  it("column missing: not available", () => {
    expect(alertEmailOf({ id: "h1" })).toEqual({ available: false, email: null });
  });
  it("column there: shows the address or nothing", () => {
    expect(alertEmailOf({ alert_email: "info@aracuya.com" })).toEqual({ available: true, email: "info@aracuya.com" });
    expect(alertEmailOf({ alert_email: null })).toEqual({ available: true, email: null });
  });
});

describe("setHotelAlertEmail", () => {
  it("writes the address", async () => {
    expect(await setHotelAlertEmail("h1", "a@inn.gh")).toBe("ok");
    expect(row.alert_email).toBe("a@inn.gh");
  });
  it("column missing: says so, does not throw", async () => {
    columnMissing = true;
    expect(await setHotelAlertEmail("h1", "a@inn.gh")).toBe("missing");
  });
  it("other errors still throw", async () => {
    otherError = { code: "08006", message: "connection failure" };
    await expect(setHotelAlertEmail("h1", "a@inn.gh")).rejects.toMatchObject({ code: "08006" });
  });
});

describe("PATCH /api/admin/hotel/alert-email", () => {
  it("saves a valid address", async () => {
    const res = await patchAlert({ alert_email: "Desk@Inn.gh" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, alert_email: "desk@inn.gh" });
    expect(row.alert_email).toBe("desk@inn.gh");
  });
  it("empty clears it", async () => {
    row.alert_email = "old@inn.gh";
    const res = await patchAlert({ alert_email: "" });
    expect(res.status).toBe(200);
    expect(row.alert_email).toBeNull();
  });
  it("bad address: 400, nothing saved", async () => {
    const res = await patchAlert({ alert_email: "a@inn.gh, b@inn.gh" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Enter one email address only.");
    expect("alert_email" in row).toBe(false);
  });
  it("column missing: 503 with a plain message, not a 500", async () => {
    columnMissing = true;
    const res = await patchAlert({ alert_email: "desk@inn.gh" });
    expect(res.status).toBe(503);
    expect((await res.json()).notSetUp).toBe(true);
  });
  it("not logged in: 401", async () => {
    session = null;
    expect((await patchAlert({ alert_email: "desk@inn.gh" })).status).toBe(401);
  });
});

describe("POST /api/signup/hotel sets the alert email", () => {
  const step = { town: "Busua", rooms: 6, contactEmail: "Owner@Inn.gh" };

  it("alert emails go to the contact email", async () => {
    const res = await postHotelStep(step);
    expect(res.status).toBe(200);
    expect(row.contact_email).toBe("owner@inn.gh");
    expect(row.alert_email).toBe("owner@inn.gh");
  });
  it("column missing: sign-up still succeeds, other details saved", async () => {
    columnMissing = true;
    const res = await postHotelStep(step);
    expect(res.status).toBe(200);
    expect(row.contact_email).toBe("owner@inn.gh");
    expect("alert_email" in row).toBe(false);
  });
  it("finished sign-up (e.g. Aracuya, active): nothing changes", async () => {
    hotel = { id: "h1", slug: "aracuya", billing_status: "active" };
    row = { alert_email: "info@aracuya.com" };
    const res = await postHotelStep(step);
    expect(res.status).toBe(409);
    expect(row.alert_email).toBe("info@aracuya.com");
  });
});
