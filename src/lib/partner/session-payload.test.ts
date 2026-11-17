import { describe, expect, it, vi } from "vitest";

// Supabase answers "column does not exist" for email_confirm_pending: the SQL has not run.
vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: null, error: { code: "42703", message: "column partner_accounts.email_confirm_pending does not exist" } }) }),
        limit: async () => ({ error: { code: "PGRST205", message: "Could not find the table 'public.partner_tokens'" } }),
      }),
    }),
  },
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

const { sessionPayloadFor, createPartnerSessionToken, verifyPartnerSessionToken } = await import("./auth");
const { supabaseSignupStore } = await import("@/lib/db/partner-signup");

describe("P2 sign-up: sessions and the before-SQL fallback", () => {
  it("an account with no hotel gets a valid partner session with empty hotel fields", async () => {
    const payload = sessionPayloadFor({ id: "acc", email: "new@x.com", whatsapp: null, name: "Kwame" }, null, "");
    expect(payload).toEqual({ accountId: "acc", influencerId: "", hotelId: "", hotelSlug: "", email: "new@x.com", name: "Kwame" });
    const back = await verifyPartnerSessionToken(await createPartnerSessionToken(payload));
    expect(back).toMatchObject({ accountId: "acc", influencerId: "" });
  });

  it("with a hotel, the session opens on it (same fields as before)", () => {
    const m = { id: "m1", hotel_id: "h1", email: "a@x.com", whatsapp: null, name: "Ama" };
    expect(sessionPayloadFor(null, m, "aracuya")).toEqual({ influencerId: "m1", hotelId: "h1", hotelSlug: "aracuya", email: "a@x.com", name: "Ama" });
  });

  it("before the SQL: nobody is asked to confirm, sign-up is not ready", async () => {
    expect(await supabaseSignupStore.confirmPending("acc")).toBe(false);
    expect(await supabaseSignupStore.ready()).toBe(false);
  });
});
