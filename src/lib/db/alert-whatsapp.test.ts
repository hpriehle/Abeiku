import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/client", () => ({ supabase: {} }));
const { parseAlertWhatsApp, alertWhatsAppOf } = await import("./alert-whatsapp");

describe("manager WhatsApp number for alerts", () => {
  it("accepts international numbers and stores +digits", () => {
    expect(parseAlertWhatsApp("+233 55 154 2355")).toEqual({ ok: true, phone: "+233551542355" });
    expect(parseAlertWhatsApp("00233-55-154-2355")).toEqual({ ok: true, phone: "+233551542355" });
  });
  it("empty clears it", () => {
    expect(parseAlertWhatsApp("")).toEqual({ ok: true, phone: null });
    expect(parseAlertWhatsApp(null)).toEqual({ ok: true, phone: null });
  });
  it("refuses local-only, junk and several numbers", () => {
    expect(parseAlertWhatsApp("055 154 2355").ok).toBe(false);
    expect(parseAlertWhatsApp("+233 55 154 2355, +233 59 795 7528").ok).toBe(false);
    expect(parseAlertWhatsApp("+12").ok).toBe(false);
    expect(parseAlertWhatsApp("call me").ok).toBe(false);
    expect(parseAlertWhatsApp(233551542355).ok).toBe(false);
  });
  it("settings view: unavailable before the SQL, connected only with token + phone id", () => {
    expect(alertWhatsAppOf({})).toEqual({ available: false, phone: null, connected: false });
    expect(alertWhatsAppOf({ alert_whatsapp: "+233551542355", whatsapp_access_token: "t", whatsapp_phone_number_id: "1" })).toEqual({
      available: true,
      phone: "+233551542355",
      connected: true,
    });
    expect(alertWhatsAppOf({ alert_whatsapp: null, whatsapp_access_token: "t" }).connected).toBe(false);
  });
});
