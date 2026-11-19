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
  it("several numbers separated by commas: each checked, stored as +digits", () => {
    expect(parseAlertWhatsApp("+233 55 154 2355, +1 (703) 232-6925")).toEqual({ ok: true, phone: "+233551542355, +17032326925" });
    expect(parseAlertWhatsApp(" +233551542355;0017032326925 , ,+233 55 154 2355 ")).toEqual({ ok: true, phone: "+233551542355, +17032326925" });
    expect(parseAlertWhatsApp(" , ")).toEqual({ ok: true, phone: null });
    expect(parseAlertWhatsApp("+233551542355, 0597957528")).toEqual({ ok: false, error: 'Include the country code ("0597957528"), e.g. +233 55 154 2355.' });
    expect(parseAlertWhatsApp("+233551542355, call me")).toEqual({ ok: false, error: 'Enter a valid phone number with country code ("call me").' });
    expect(parseAlertWhatsApp("+233551542355, +12").ok).toBe(false);
  });
  it("refuses local-only and junk", () => {
    expect(parseAlertWhatsApp("055 154 2355")).toEqual({ ok: false, error: "Include the country code, e.g. +233 55 154 2355." });
    expect(parseAlertWhatsApp("+233 55 154 2355 / 2356").ok).toBe(false);
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
