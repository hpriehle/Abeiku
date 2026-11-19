// Platform alert sender: a hotel without its own WhatsApp number sends manager booking
// alerts from WHATSAPP_ALERT_SENDER_HOTEL_ID's number; a hotel with its own always uses it.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ARACUYA = "75218f6b-a953-4b74-b5c8-abd040af21f1";
const TEST_HOTEL = "013b60e4-e55f-46f9-966b-70e0773f42e4";
const OWN = "own-hotel";

type Row = Record<string, unknown>;
const hotels: Record<string, Row> = {};

// Minimal supabase stub: from("hotels").select().eq("id"|"active").not().maybeSingle() / await.
vi.mock("@/lib/supabase/client", () => {
  const query = () => {
    const filters: [string, unknown][] = [];
    const rows = () => Object.values(hotels).filter((h) => filters.every(([k, v]) => h[k] === v));
    const q = {
      select: () => q,
      eq: (k: string, v: unknown) => (filters.push([k, v]), q),
      not: () => q,
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      then: (ok: (r: { data: Row[]; error: null }) => unknown) => Promise.resolve({ data: rows(), error: null }).then(ok),
    };
    return q;
  };
  return { supabase: { from: () => query() } };
});

const sent: { to: string; bodyParams: string[]; sender: string; phoneId: unknown }[] = [];
vi.mock("@/lib/whatsapp/client", async () => {
  const { getHotel } = await import("@/lib/hotel-context");
  return {
    sendTemplate: vi.fn(async (to: string, p: { bodyParams: string[] }) => {
      const h = getHotel();
      sent.push({ to, bodyParams: p.bodyParams, sender: h.id, phoneId: h.whatsapp_phone_number_id });
      return "wamid.1";
    }),
  };
});

vi.mock("@/lib/db", () => ({ getHotelById: vi.fn(async (id: string) => hotels[id] ?? null) }));

const { pickAlertSender, alertSenderHotelId } = await import("./alert-sender");
const { metaWhatsAppAlerter } = await import("./index");
const { supabaseAlertStore, alertSenderReady } = await import("@/lib/db/booking-alerts");

const creds = (phone: string) => ({ whatsapp_access_token: "tok", whatsapp_phone_number_id: phone });
const base = (id: string, name: string, slug: string) => ({ id, name, slug, active: true, alert_email: `${slug}@x.com`, alert_whatsapp: "+233551542355" });

beforeEach(() => {
  for (const k of Object.keys(hotels)) delete hotels[k];
  hotels[ARACUYA] = { ...base(ARACUYA, "Aracuya", "aracuya"), whatsapp_access_token: null, whatsapp_phone_number_id: null };
  hotels[TEST_HOTEL] = { ...base(TEST_HOTEL, "Test Hotel", "test-hotel"), alert_whatsapp: null, ...creds("1456929977506972") };
  hotels[OWN] = { ...base(OWN, "Own Hotel", "own"), ...creds("999") };
  sent.length = 0;
});
afterEach(() => vi.unstubAllEnvs());

describe("alertSenderHotelId", () => {
  it("reads and trims the env, empty = off", () => {
    expect(alertSenderHotelId({ WHATSAPP_ALERT_SENDER_HOTEL_ID: ` ${TEST_HOTEL} ` })).toBe(TEST_HOTEL);
    expect(alertSenderHotelId({ WHATSAPP_ALERT_SENDER_HOTEL_ID: " " })).toBeNull();
    expect(alertSenderHotelId({})).toBeNull();
  });
});

describe("pickAlertSender", () => {
  const load = async (id: string) => (hotels[id] as never) ?? null;
  it("own number always wins, even with a sender configured", async () => {
    expect((await pickAlertSender(hotels[OWN], load, TEST_HOTEL))?.id).toBe(OWN);
  });
  it("no own number: the platform sender when configured and connected", async () => {
    expect((await pickAlertSender(hotels[ARACUYA], load, TEST_HOTEL))?.id).toBe(TEST_HOTEL);
  });
  it("no own number and no sender (or sender not connected): none", async () => {
    expect(await pickAlertSender(hotels[ARACUYA], load, null)).toBeNull();
    hotels[TEST_HOTEL].whatsapp_access_token = null;
    expect(await pickAlertSender(hotels[ARACUYA], load, TEST_HOTEL)).toBeNull();
    expect(await pickAlertSender(hotels[ARACUYA], load, "missing")).toBeNull();
  });
});

describe("metaWhatsAppAlerter", () => {
  const msg = (hotelId: string, hotelName: string) => ({ hotelId, hotelName, to: "233551542355", summary: "New booking: Ama, 20 Nov" });

  it("hotel without its own number sends from the sender hotel, text names the alerting hotel", async () => {
    vi.stubEnv("WHATSAPP_ALERT_SENDER_HOTEL_ID", TEST_HOTEL);
    expect(await metaWhatsAppAlerter(msg(ARACUYA, "Aracuya"))).toEqual({ success: true, id: "wamid.1" });
    expect(sent).toEqual([{ to: "233551542355", bodyParams: ["Aracuya", "New booking: Ama, 20 Nov"], sender: TEST_HOTEL, phoneId: "1456929977506972" }]);
  });

  it("hotel with its own number uses it, even with a sender configured", async () => {
    vi.stubEnv("WHATSAPP_ALERT_SENDER_HOTEL_ID", TEST_HOTEL);
    expect(await metaWhatsAppAlerter(msg(OWN, "Own Hotel"))).toEqual({ success: true, id: "wamid.1" });
    expect(sent).toEqual([{ to: "233551542355", bodyParams: ["Own Hotel", "New booking: Ama, 20 Nov"], sender: OWN, phoneId: "999" }]);
  });

  it("no env: hotel without its own number gets no WhatsApp", async () => {
    vi.stubEnv("WHATSAPP_ALERT_SENDER_HOTEL_ID", "");
    expect(await metaWhatsAppAlerter(msg(ARACUYA, "Aracuya"))).toEqual({ success: false, error: "WhatsApp not connected" });
    expect(sent).toEqual([]);
  });
});

describe("listAlertHotels: whatsappConnected", () => {
  const connected = async () =>
    Object.fromEntries((await supabaseAlertStore.listAlertHotels()).map((h) => [h.id, h.whatsappConnected]));

  it("with a connected sender, hotels without their own number can send", async () => {
    vi.stubEnv("WHATSAPP_ALERT_SENDER_HOTEL_ID", TEST_HOTEL);
    expect(await alertSenderReady()).toBe(true);
    expect(await connected()).toEqual({ [ARACUYA]: true, [TEST_HOTEL]: true, [OWN]: true });
  });

  it("without the env (or a disconnected sender), only hotels with their own number", async () => {
    vi.stubEnv("WHATSAPP_ALERT_SENDER_HOTEL_ID", "");
    expect(await connected()).toEqual({ [ARACUYA]: false, [TEST_HOTEL]: true, [OWN]: true });
    vi.stubEnv("WHATSAPP_ALERT_SENDER_HOTEL_ID", ARACUYA);
    expect(await alertSenderReady()).toBe(false);
    expect((await connected())[ARACUYA]).toBe(false);
  });
});
