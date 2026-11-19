import { beforeEach, describe, expect, it, vi } from "vitest";

// Resend is mocked: no email leaves the test.
const send = vi.fn(async (_msg: Record<string, unknown>) => ({ data: { id: "x" }, error: null as null | { message: string } }));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send };
  },
}));

const { sendEmail, fromEmail, DEFAULT_FROM_EMAIL } = await import("./email");

describe("sendEmail (Resend)", () => {
  beforeEach(() => {
    send.mockClear();
    delete process.env.NOTIFICATION_FROM_EMAIL;
  });

  it("sends from notifications@abeiku.com by default (not mail.abeiku.com)", async () => {
    expect(DEFAULT_FROM_EMAIL).toBe("notifications@abeiku.com");
    const res = await sendEmail({ to: "info@aracuya.com", subject: "S", html: "<p>h</p>", text: "t" });
    expect(res).toEqual({ success: true, id: "x" });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toMatchObject({ from: "Abeiku <notifications@abeiku.com>", to: "info@aracuya.com", subject: "S", text: "t" });
  });

  it("NOTIFICATION_FROM_EMAIL still overrides", async () => {
    process.env.NOTIFICATION_FROM_EMAIL = "alerts@abeiku.com";
    expect(fromEmail()).toBe("alerts@abeiku.com");
    await sendEmail({ to: "a@b.c", subject: "S", html: "h" });
    expect(send.mock.calls[0][0].from).toBe("Abeiku <alerts@abeiku.com>");
  });

  it("reports a Resend error as a failure", async () => {
    send.mockResolvedValueOnce({ data: null as never, error: { message: "domain not verified" } });
    expect(await sendEmail({ to: "a@b.c", subject: "S", html: "h" })).toEqual({ success: false, error: "domain not verified" });
  });
});
