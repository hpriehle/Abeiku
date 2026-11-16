import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const arrivalsDigestFor = vi.fn<(d: string) => Promise<unknown>>(async () => ({ sent: 1, empty: 0, already: 0, failed: 0 }));
vi.mock("@/lib/alerts", () => ({ arrivalsDigestFor: (d: string) => arrivalsDigestFor(d) }));
const runLifecycleChecks = vi.fn(async () => ({}));
vi.mock("@/lib/lifecycle", () => ({ runLifecycleChecks: () => runLifecycleChecks() }));
vi.mock("@/lib/db", () => ({ getAllActiveHotels: async () => [{ id: "h1", slug: "aracuya" }], getHotelById: async () => null }));

const digest = await import("./arrivals-digest/route");
const lifecycle = await import("./lifecycle/route");

const req = (path: string, auth?: string) =>
  new NextRequest(`http://localhost${path}`, { method: "POST", headers: auth ? { authorization: auth } : {} });

afterEach(() => {
  delete process.env.CRON_SECRET;
  delete process.env.LIFECYCLE_CRON_ENABLED;
  arrivalsDigestFor.mockClear();
  runLifecycleChecks.mockClear();
});

describe("/api/cron/arrivals-digest", () => {
  it("refuses without CRON_SECRET set, and with a wrong token", async () => {
    expect((await digest.POST(req("/api/cron/arrivals-digest", "Bearer x"))).status).toBe(401);
    process.env.CRON_SECRET = "s";
    expect((await digest.POST(req("/api/cron/arrivals-digest", "Bearer x"))).status).toBe(401);
    expect(arrivalsDigestFor).not.toHaveBeenCalled();
  });

  it("runs for tomorrow (or ?date=) with the right token", async () => {
    process.env.CRON_SECRET = "s";
    vi.useFakeTimers({ now: new Date("2026-11-15T18:00:05Z"), toFake: ["Date"] });
    const res = await digest.POST(req("/api/cron/arrivals-digest", "Bearer s"));
    vi.useRealTimers();
    expect(res.status).toBe(200);
    expect(arrivalsDigestFor).toHaveBeenCalledWith("2026-11-16");
    await digest.POST(req("/api/cron/arrivals-digest?date=2026-12-24", "Bearer s"));
    expect(arrivalsDigestFor).toHaveBeenLastCalledWith("2026-12-24");
    expect((await digest.POST(req("/api/cron/arrivals-digest?date=tomorrow", "Bearer s"))).status).toBe(400);
  });
});

describe("/api/cron/lifecycle (guest messages) stays off", () => {
  it("refuses when CRON_SECRET is not set (it used to run for anyone then)", async () => {
    process.env.LIFECYCLE_CRON_ENABLED = "true";
    expect((await lifecycle.GET(req("/api/cron/lifecycle"))).status).toBe(401);
    expect(runLifecycleChecks).not.toHaveBeenCalled();
  });

  it("sends nothing unless LIFECYCLE_CRON_ENABLED=true", async () => {
    process.env.CRON_SECRET = "s";
    const res = await lifecycle.GET(req("/api/cron/lifecycle", "Bearer s"));
    expect(res.status).toBe(200);
    expect((await res.json()).skipped).toMatch(/disabled/);
    expect(runLifecycleChecks).not.toHaveBeenCalled();

    process.env.LIFECYCLE_CRON_ENABLED = "true";
    await lifecycle.GET(req("/api/cron/lifecycle", "Bearer s"));
    expect(runLifecycleChecks).toHaveBeenCalledTimes(1);
  });
});

describe("Netlify lifecycle function", () => {
  it("does nothing while the flag is off", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    // @ts-expect-error -- Netlify functions are .mts files outside the Next tsconfig paths.
    const fn = (await import("../../../../netlify/functions/lifecycle.mts")).default as () => Promise<Response>;
    expect((await fn()).status).toBe(200);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
    log.mockRestore();
  });
});
