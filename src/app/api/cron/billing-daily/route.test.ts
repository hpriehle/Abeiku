import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const runDailyBillingCheck = vi.fn(async () => ({ checked: 2, trialReminders: 1, ended: 0, locked: 0 }));
vi.mock("@/lib/billing/notices", () => ({ runDailyBillingCheck: () => runDailyBillingCheck() }));
vi.mock("@/lib/billing", () => ({ billingDeps: () => ({}) }));

const route = await import("./route");
const req = (auth?: string) =>
  new NextRequest("http://localhost/api/cron/billing-daily", { method: "POST", headers: auth ? { authorization: auth } : {} });

afterEach(() => {
  delete process.env.CRON_SECRET;
  runDailyBillingCheck.mockClear();
});

describe("/api/cron/billing-daily", () => {
  it("refuses without CRON_SECRET or with a wrong token", async () => {
    expect((await route.POST(req("Bearer x"))).status).toBe(401);
    process.env.CRON_SECRET = "s";
    expect((await route.POST(req("Bearer x"))).status).toBe(401);
    expect(runDailyBillingCheck).not.toHaveBeenCalled();
  });
  it("runs the check with the right token and returns counts only", async () => {
    process.env.CRON_SECRET = "s";
    const res = await route.POST(req("Bearer s"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, checked: 2, trialReminders: 1, ended: 0, locked: 0 });
  });
});
