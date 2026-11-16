import crypto from "crypto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const SECRET = "sk_test_webhook";
process.env.PAYSTACK_WEBHOOK_SECRET = SECRET;
process.env.PAYSTACK_PLAN_SMALL = "PLN_small";
process.env.PAYSTACK_PLAN_LARGE = "PLN_large";

const getPaymentByPaystackReference = vi.fn(async (ref: string) => (ref ? null : null));
vi.mock("@/lib/db", () => ({
  getPaymentByPaystackReference: (ref: string) => getPaymentByPaystackReference(ref),
  getHotelById: vi.fn(),
  getConversation: vi.fn(),
  updatePayment: vi.fn(),
  updateBooking: vi.fn(),
  createPlatformEarning: vi.fn(),
  createDisbursement: vi.fn(),
  updateDisbursement: vi.fn(),
  updatePaymentGlobal: vi.fn(),
}));
vi.mock("@/lib/whatsapp/chat-logger", () => ({ logEvent: vi.fn() }));
vi.mock("@/lib/whatsapp/client", () => ({ sendText: vi.fn(), sendButtons: vi.fn() }));
vi.mock("@/lib/notifications", () => ({ notifyOwner: vi.fn() }));
vi.mock("@/lib/payments/paystack-transfer", () => ({ initiateTransfer: vi.fn() }));

const { makeDeps } = await import("@/lib/billing/fakes.test-helper");
let m = makeDeps();
vi.mock("@/lib/billing", () => ({ billingDeps: () => m.deps }));

const { POST } = await import("./route");

function send(payload: object, sig?: string) {
  const body = JSON.stringify(payload);
  return POST(
    new NextRequest("http://localhost/api/paystack/webhook", {
      method: "POST",
      headers: { "x-paystack-signature": sig ?? crypto.createHmac("sha512", SECRET).update(body).digest("hex") },
      body,
    })
  );
}

describe("POST /api/paystack/webhook with L2 billing", () => {
  beforeEach(() => {
    m = makeDeps();
    m.store.add({ id: "h1", billing_status: "trialing", billing_provider: "paystack", billing_customer_id: "CUS_1", billing_subscription_id: "SUB_1" });
    getPaymentByPaystackReference.mockClear();
  });

  it("bad signature: 400 and nothing changes", async () => {
    const res = await send({ event: "invoice.payment_failed", data: { subscription: { subscription_code: "SUB_1" } } }, "0".repeat(128));
    expect(res.status).toBe(400);
    expect(m.store.updates).toHaveLength(0);
  });

  it("missing signature: 400", async () => {
    const res = await POST(new NextRequest("http://localhost/api/paystack/webhook", { method: "POST", body: "{}" }));
    expect(res.status).toBe(400);
  });

  it("billing event: hotel marked past_due, guest-payment code not reached", async () => {
    const res = await send({ event: "invoice.payment_failed", data: { id: 1, subscription: { subscription_code: "SUB_1" } } });
    expect(res.status).toBe(200);
    expect(m.store.hotels.get("h1")?.billing_status).toBe("past_due");
    expect(getPaymentByPaystackReference).not.toHaveBeenCalled();
  });

  it("guest booking payment still goes to the payment lookup as before", async () => {
    const res = await send({ event: "charge.success", data: { reference: "bk_123_1", plan: {}, metadata: { guest_name: "Ama" } } });
    expect(res.status).toBe(200);
    expect(getPaymentByPaystackReference).toHaveBeenCalledWith("bk_123_1");
    expect(m.store.updates).toHaveLength(0);
  });

  it("billing failure answers 500 so Paystack retries", async () => {
    m.store.update = async () => {
      throw new Error("db down");
    };
    const res = await send({ event: "invoice.payment_failed", data: { id: 2, subscription: { subscription_code: "SUB_1" } } });
    expect(res.status).toBe(500);
  });
});
