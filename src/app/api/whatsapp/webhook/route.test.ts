import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { signBody } from "@/lib/whatsapp/signature";

const hotel = { id: "h1", slug: "aracuya", name: "Aracuya", whatsapp_booking_bot_enabled: false };
const recordMessage = vi.fn(async () => true);
const handleMessage = vi.fn(async () => {});
const markAsRead = vi.fn(async () => ({}));
const conv = { id: "c1", phone: "233200000001", guest_state: "lead", step: "idle", guest_name: null };

vi.mock("@/lib/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/whatsapp/client", () => ({ markAsRead: (id: string) => markAsRead(id) }));
vi.mock("@/lib/whatsapp/state-machine", () => ({ handleMessage: () => handleMessage() }));
vi.mock("@/lib/whatsapp/chat-logger", () => ({ recordMessage: (p: unknown) => recordMessage(p as never) }));
vi.mock("@/lib/db", () => ({
  getHotelByWhatsAppPhoneNumberId: vi.fn(async (id: string) => (id === "PNID" ? hotel : null)),
  determineGuestState: vi.fn(async () => "lead"),
  getConversation: vi.fn(async () => conv),
  upsertConversation: vi.fn(async () => conv),
}));

const { POST, GET } = await import("./route");

const SECRET = "app-secret-for-tests";
const payload = JSON.stringify({
  object: "whatsapp_business_account",
  entry: [
    {
      id: "WABA",
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: { display_phone_number: "233597957528", phone_number_id: "PNID" },
            contacts: [{ profile: { name: "Ama" }, wa_id: "233200000001" }],
            messages: [{ from: "233200000001", id: "wamid.1", timestamp: "1", type: "text", text: { body: "Hello, a room for Friday?" } }],
          },
        },
      ],
    },
  ],
});

const post = (body: string, sig?: string) =>
  POST(new NextRequest("https://abeiku.com/api/whatsapp/webhook", { method: "POST", body, headers: sig ? { "x-hub-signature-256": sig } : {} }));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.WHATSAPP_APP_SECRET = SECRET;
  process.env.WHATSAPP_VERIFY_TOKEN = "verify-me";
});

describe("POST /api/whatsapp/webhook", () => {
  it("signed by Meta: 200 and the message is stored for the inbox (no bot, no read receipt)", async () => {
    const res = await post(payload, signBody(payload, SECRET));
    expect(res.status).toBe(200);
    expect(recordMessage).toHaveBeenCalledWith(
      expect.objectContaining({ hotelId: "h1", direction: "inbound", body: "Hello, a room for Friday?", waMessageId: "wamid.1", senderName: "Ama" })
    );
    expect(handleMessage).not.toHaveBeenCalled();
    expect(markAsRead).not.toHaveBeenCalled();
  });

  it("no signature: 401, nothing stored", async () => {
    const res = await post(payload);
    expect(res.status).toBe(401);
    expect(recordMessage).not.toHaveBeenCalled();
  });

  it("wrong secret or changed body: 401", async () => {
    expect((await post(payload, signBody(payload, "someone-else"))).status).toBe(401);
    expect((await post(payload.replace("Friday", "Monday"), signBody(payload, SECRET))).status).toBe(401);
    expect(recordMessage).not.toHaveBeenCalled();
  });

  it("WHATSAPP_APP_SECRET missing: refuses everything (fails closed)", async () => {
    delete process.env.WHATSAPP_APP_SECRET;
    expect((await post(payload, signBody(payload, SECRET))).status).toBe(401);
    expect(recordMessage).not.toHaveBeenCalled();
  });

  it("coexistence echo (staff replied from the Business app) is stored as outbound", async () => {
    const echo = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{ id: "WABA", changes: [{ field: "smb_message_echoes", value: { metadata: { phone_number_id: "PNID" }, message_echoes: [{ from: "233597957528", to: "233200000001", id: "wamid.2", timestamp: "2", type: "text", text: { body: "Yes, we have a room" } }] } }] }],
    });
    expect((await post(echo, signBody(echo, SECRET))).status).toBe(200);
    expect(recordMessage).toHaveBeenCalledWith(
      expect.objectContaining({ direction: "outbound", senderType: "admin", body: "Yes, we have a room", phone: "233200000001" })
    );
  });
});

describe("GET /api/whatsapp/webhook (Meta verification)", () => {
  const get = (token: string) =>
    GET(new NextRequest(`https://abeiku.com/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${token}&hub.challenge=12345`));
  it("right token: echoes the challenge", async () => {
    const res = await get("verify-me");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("12345");
  });
  it("wrong token: 403", async () => {
    expect((await get("nope")).status).toBe(403);
  });
});
