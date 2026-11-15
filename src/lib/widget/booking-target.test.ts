import { describe, it, expect } from "vitest";
import { bookingTarget, resolveBookingUrl, widgetWhatsAppPhone } from "./booking-target";

const base = { whatsapp_display_phone: null, contact_phone: null, booking_url: null };

describe("widget Book button target (F2 item 4)", () => {
  it("Aracuya goes to aracuya.com/reserve, not WhatsApp", () => {
    const t = bookingTarget({ ...base, slug: "aracuya", whatsapp_display_phone: "+233 20 000 0000" }, {});
    expect(t).toEqual({ kind: "url", url: "https://aracuya.com/reserve" });
  });
  it("respects ARACUYA_URL", () => {
    expect(resolveBookingUrl({ ...base, slug: "aracuya" }, { ARACUYA_URL: "https://www.aracuya.com/" })).toBe(
      "https://www.aracuya.com/reserve"
    );
  });
  it("hotel record wins, then HOTEL_BOOKING_URLS", () => {
    expect(resolveBookingUrl({ ...base, slug: "aracuya", booking_url: "https://book.example.com/x" }, {})).toBe(
      "https://book.example.com/x"
    );
    expect(
      resolveBookingUrl({ ...base, slug: "palm" }, { HOTEL_BOOKING_URLS: '{"palm":"https://palm.example/reserve"}' })
    ).toBe("https://palm.example/reserve");
  });
  it("ignores unsafe or broken URLs", () => {
    expect(resolveBookingUrl({ ...base, slug: "x", booking_url: "javascript:alert(1)" }, {})).toBeNull();
    expect(resolveBookingUrl({ ...base, slug: "x" }, { HOTEL_BOOKING_URLS: "{bad json" })).toBeNull();
  });
  it("other hotels keep the WhatsApp message when they have a number", () => {
    expect(bookingTarget({ ...base, slug: "palm", contact_phone: "+233 24 111 2222" }, {})).toEqual({
      kind: "whatsapp",
      phone: "233241112222",
    });
  });
  it("no number: no button, contact note", () => {
    expect(bookingTarget({ ...base, slug: "test-hotel" }, {})).toEqual({ kind: "contact" });
  });
  it("never uses the MoMo payout phone", () => {
    const hotel = { ...base, slug: "palm", momo_phone: "0244000000" } as Parameters<typeof widgetWhatsAppPhone>[0];
    expect(widgetWhatsAppPhone(hotel)).toBeNull();
  });
});
