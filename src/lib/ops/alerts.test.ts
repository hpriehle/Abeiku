import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../notifications/email", () => ({ sendEmail: vi.fn(async () => ({ success: true })) }));
vi.mock("../supabase/client", () => ({ supabase: {} }));

const { alertFeedFailures, memoryClaim, opsAlert, opsAlertEmail, opsAlertEmailContent, resetOpsAlertMemory, OPS_ALERT_WINDOW_MS } =
  await import("./alerts");

const HOUR = OPS_ALERT_WINDOW_MS;

function deps(over: { claim?: (k: string, n: number, w: number) => Promise<boolean>; now?: number } = {}) {
  const mailer = vi.fn<(m: { to: string; subject: string; html: string; text: string }) => Promise<{ success: boolean }>>(async () => ({ success: true }));
  let now = over.now ?? Date.parse("2026-11-17T10:00:00Z");
  return {
    mailer,
    tick: (ms: number) => (now += ms),
    d: { mailer, claim: over.claim ?? (async () => true), env: {} as NodeJS.ProcessEnv, now: () => now },
  };
}

beforeEach(() => {
  resetOpsAlertMemory();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("opsAlert (L3)", () => {
  it("emails Harrison with an Abeiku subject and the error", async () => {
    const { mailer, d } = deps();
    expect(await opsAlert("stripe-webhook", "Stripe webhook invoice.paid failed", new Error("db down"), d)).toBe("sent");
    const msg = mailer.mock.calls[0][0];
    expect(msg.to).toBe("hpriehle@gmail.com");
    expect(msg.subject).toBe("Abeiku alert: Stripe webhook invoice.paid failed");
    expect(msg.text).toContain("Error: db down");
    expect(msg.text).toContain("Kind: stripe-webhook");
  });

  it("at most one email per kind per hour; other kinds are separate", async () => {
    const { mailer, d, tick } = deps();
    expect(await opsAlert("whatsapp-webhook", "a", "x", d)).toBe("sent");
    tick(10 * 60 * 1000);
    expect(await opsAlert("whatsapp-webhook", "a", "x", d)).toBe("throttled");
    expect(await opsAlert("paystack-webhook", "b", "y", d)).toBe("sent");
    tick(HOUR);
    expect(await opsAlert("whatsapp-webhook", "a", "x", d)).toBe("sent");
    expect(mailer).toHaveBeenCalledTimes(3);
  });

  it("the shared table can throttle (another instance already sent)", async () => {
    const { mailer, d } = deps({ claim: async () => false });
    expect(await opsAlert("booking-sync", "a", undefined, d)).toBe("throttled");
    expect(mailer).not.toHaveBeenCalled();
  });

  it("table missing: falls back to the in-memory throttle and still sends once", async () => {
    const claim = vi.fn(async () => {
      throw { code: "42P01", message: 'relation "ops_alerts" does not exist' };
    });
    const { mailer, d } = deps({ claim });
    expect(await opsAlert("booking-sync", "a", undefined, d)).toBe("sent");
    expect(await opsAlert("booking-sync", "a", undefined, d)).toBe("throttled");
    expect(mailer).toHaveBeenCalledTimes(1);
  });

  it("never throws: a failing mailer gives 'failed'", async () => {
    const { d } = deps();
    d.mailer.mockRejectedValueOnce(new Error("resend down"));
    expect(await opsAlert("alert-send-email", "a", undefined, d)).toBe("failed");
  });

  it("does nothing without RESEND_API_KEY (local dev, tests)", async () => {
    expect(await opsAlert("x", "y", undefined, { env: {} as NodeJS.ProcessEnv, claim: async () => true })).toBe("not-configured");
  });

  it("OPS_ALERT_EMAIL overrides the address", () => {
    expect(opsAlertEmail({ OPS_ALERT_EMAIL: " ops@abeiku.com " } as unknown as NodeJS.ProcessEnv)).toBe("ops@abeiku.com");
  });

  it("escapes HTML in the email", () => {
    expect(opsAlertEmailContent("k", "<b>", "<script>", new Date(0)).html).not.toContain("<script>");
  });

  it("memoryClaim", () => {
    const m = new Map<string, number>();
    expect(memoryClaim("k", 0, HOUR, m)).toBe(true);
    expect(memoryClaim("k", HOUR - 1, HOUR, m)).toBe(false);
    expect(memoryClaim("k", HOUR, HOUR, m)).toBe(true);
  });
});

describe("alertFeedFailures (L3)", () => {
  it("one alert per hotel with failed feeds, kind per hotel", async () => {
    const alert = vi.fn(async () => "sent" as const);
    await alertFeedFailures(
      [
        { slug: "aracuya", errors: [] },
        { slug: "lakeside", errors: ["ical: HTTP 404", "google: no access"] },
      ],
      alert,
    );
    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert).toHaveBeenCalledWith("booking-sync-feed:lakeside", "Booking sync: 2 calendar feeds of lakeside failed", "ical: HTTP 404\ngoogle: no access");
  });
});
