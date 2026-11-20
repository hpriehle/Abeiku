import { describe, expect, it, vi } from "vitest";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1";
const now = new Date().toISOString();
const tables: Record<string, Record<string, unknown>[]> = {
  influencers: [{ id: "a" }, { id: "b" }],
  influencer_clicks: [
    { influencer_id: "a", user_agent: IPHONE, clicked_at: now },
    { influencer_id: "a", user_agent: IPHONE, clicked_at: now },
    { influencer_id: "a", user_agent: "curl/8.5.0", clicked_at: now },
    { influencer_id: "a", user_agent: null, clicked_at: now },
    { influencer_id: "b", user_agent: "WhatsApp/2.23.20.0 A", clicked_at: now },
    { influencer_id: "b", user_agent: IPHONE, clicked_at: now },
  ],
};

// Minimal PostgREST stand-in: honours eq/in on influencer_id, ignores the rest.
vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    from(table: string) {
      let rows = tables[table];
      const q = {
        select: () => q,
        gte: () => q,
        eq: (col: string, v: unknown) => ((rows = rows.filter((r) => col !== "influencer_id" || r[col] === v)), q),
        in: (col: string, vs: unknown[]) => ((rows = rows.filter((r) => vs.includes(r[col]))), q),
        then: (resolve: (r: unknown) => void) => resolve({ data: rows, error: null }),
      };
      return q;
    },
  },
}));

import { getClickCountsByInfluencer, getClicksByDay, getTotalClicks } from "./influencers";

describe("click stats skip bots and scripts", () => {
  it("partner total", async () => {
    expect(await getTotalClicks("a")).toBe(2);
    expect(await getTotalClicks("b")).toBe(1);
  });

  it("partner clicks by day", async () => {
    const days = await getClicksByDay("a", 30);
    expect(days.reduce((n, d) => n + d.count, 0)).toBe(2);
  });

  it("admin partner list", async () => {
    expect(Object.fromEntries(await getClickCountsByInfluencer("h1"))).toEqual({ a: 2, b: 1 });
  });
});
