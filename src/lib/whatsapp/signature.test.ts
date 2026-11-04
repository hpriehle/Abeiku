import { describe, it, expect } from "vitest";
import { checkWebhookSignature, signBody } from "./signature";

const secret = "test-app-secret";
const body = JSON.stringify({ object: "whatsapp_business_account", entry: [] });

describe("WhatsApp webhook X-Hub-Signature-256 check", () => {
  it("accepts the signature Meta would send", () => {
    expect(checkWebhookSignature(body, signBody(body, secret), secret)).toBe("ok");
  });

  it("accepts an upper-case hex digest", () => {
    const h = signBody(body, secret);
    expect(checkWebhookSignature(body, "sha256=" + h.slice(7).toUpperCase(), secret)).toBe("ok");
  });

  it("rejects a body changed after signing", () => {
    expect(checkWebhookSignature(body + " ", signBody(body, secret), secret)).toBe("mismatch");
  });

  it("rejects a signature made with another secret", () => {
    expect(checkWebhookSignature(body, signBody(body, "other"), secret)).toBe("mismatch");
  });

  it("rejects a missing or malformed header", () => {
    expect(checkWebhookSignature(body, null, secret)).toBe("missing-header");
    expect(checkWebhookSignature(body, "", secret)).toBe("missing-header");
    expect(checkWebhookSignature(body, "sha1=abc", secret)).toBe("missing-header");
    expect(checkWebhookSignature(body, "sha256=zz", secret)).toBe("mismatch");
    expect(checkWebhookSignature(body, "sha256=" + "a".repeat(63), secret)).toBe("mismatch");
  });

  it("fails closed when WHATSAPP_APP_SECRET is not set", () => {
    expect(checkWebhookSignature(body, signBody(body, secret), undefined)).toBe("missing-secret");
    expect(checkWebhookSignature(body, signBody(body, secret), "")).toBe("missing-secret");
  });
});
