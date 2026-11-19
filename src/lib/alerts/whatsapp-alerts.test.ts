// Manager WhatsApp booking alerts: routing (only hotels with a connected number and a
// manager number), sent alongside the email, never to the guest, never twice.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { alertBookingsNow, runBookingAlerts, whatsAppAlertTo, type AlertHotel, type Mailer, type WhatsAppAlerter } from "./booking-alerts";
import { memoryAlertStore } from "./memory-alert-store.test-helper";
import { memoryHotelBookings } from "@/lib/bookings/memory-store.test-helper";
import type { HotelBookingRow } from "@/lib/bookings/hotel-bookings";

const H = "75218f6b-a953-4b74-b5c8-abd040af21f1";
const TODAY = "2026-11-15";
const MANAGER = "+233 55 154 2355";
const GUEST_PHONE = "233200000001";
const BASE: AlertHotel = { id: H, name: "Aracuya", slug: "aracuya", alert_email: "info@aracuya.com", totalRooms: 3 };

let n = 0;
function row(over: Partial<HotelBookingRow> & Record<string, unknown> = {}): HotelBookingRow & Record<string, unknown> {
  n++;
  return {
    id: `r${n}`,
    hotel_id: H,
    source: "airbnb",
    external_ref: `ev${n}`,
    guest_name: "Ama Mensah",
    phone: GUEST_PHONE,
    guest_email: null,
    guests: 2,
    room_slug: "suite",
    rooms_count: 3,
    check_in: "2026-11-20",
    check_out: "2026-11-23",
    total_price: 0,
    currency: "GHS",
    payment_status: "unpaid",
    payment_provider: null,
    booking_status: "confirmed",
    calendar_event_id: null,
    ref_code: null,
    paid_at: null,
    ...over,
  };
}

function setup(hotel: AlertHotel, rows = [row()], opts: { emailFails?: boolean; whatsappFails?: boolean } = {}) {
  const db = memoryHotelBookings(rows);
  const { store } = memoryAlertStore(db.rows, { hotels: [hotel] });
  const emails: string[] = [];
  const mailer: Mailer = vi.fn(async (m) => {
    if (opts.emailFails) return { success: false, error: "resend down" };
    emails.push(m.subject);
    return { success: true };
  });
  const whatsapps: Parameters<WhatsAppAlerter>[0][] = [];
  const whatsapp: WhatsAppAlerter = vi.fn(async (m) => {
    if (opts.whatsappFails) return { success: false, error: "(#132001) Template name does not exist" };
    whatsapps.push(m);
    return { success: true };
  });
  return { db, store, mailer, whatsapp, emails, whatsapps };
}

beforeEach(() => {
  n = 0;
});

describe("whatsAppAlertTo (routing)", () => {
  it("needs both a connected WhatsApp number and a manager number", () => {
    expect(whatsAppAlertTo({ alert_whatsapp: MANAGER, whatsappConnected: true })).toEqual(["233551542355"]);
    expect(whatsAppAlertTo({ alert_whatsapp: MANAGER, whatsappConnected: false })).toEqual([]);
    expect(whatsAppAlertTo({ alert_whatsapp: MANAGER })).toEqual([]);
    expect(whatsAppAlertTo({ alert_whatsapp: null, whatsappConnected: true })).toEqual([]);
    expect(whatsAppAlertTo({ alert_whatsapp: "", whatsappConnected: true })).toEqual([]);
  });

  it("normalises the number and refuses junk", () => {
    expect(whatsAppAlertTo({ alert_whatsapp: "00233551542355", whatsappConnected: true })).toEqual(["233551542355"]);
    expect(whatsAppAlertTo({ alert_whatsapp: "12345", whatsappConnected: true })).toEqual([]);
    expect(whatsAppAlertTo({ alert_whatsapp: "1".repeat(16), whatsappConnected: true })).toEqual([]);
  });

  it("several numbers: spaces, semicolons and duplicates tolerated, bad entries skipped", () => {
    expect(whatsAppAlertTo({ alert_whatsapp: "+233 55 154 2355,+1 (703) 232-6925", whatsappConnected: true })).toEqual(["233551542355", "17032326925"]);
    expect(whatsAppAlertTo({ alert_whatsapp: " +233551542355 ; 12345 ; 00233551542355 ,", whatsappConnected: true })).toEqual(["233551542355"]);
  });
});

describe("WhatsApp booking alert alongside the email", () => {
  it("connected hotel with a manager number: email AND WhatsApp to the manager (not the guest)", async () => {
    const t = setup({ ...BASE, alert_whatsapp: MANAGER, whatsappConnected: true });
    const c = await runBookingAlerts({ store: t.store, mailer: t.mailer, whatsapp: t.whatsapp, today: TODAY });
    expect(c.newSent).toBe(1);
    expect(c.whatsappSent).toBe(1);
    expect(t.emails).toHaveLength(1);
    expect(t.whatsapps).toEqual([
      { hotelId: H, hotelName: "Aracuya", to: "233551542355", summary: t.emails[0] },
    ]);
    expect(t.whatsapps[0].summary).toBe("New booking: Ama Mensah, 20–23 Nov, 3 rooms (Entire House) (Airbnb)");
    expect(t.whatsapps.map((w) => w.to)).not.toContain(GUEST_PHONE);
  });

  it("hotel without a connected WhatsApp number: email only", async () => {
    const t = setup({ ...BASE, alert_whatsapp: MANAGER, whatsappConnected: false });
    const c = await runBookingAlerts({ store: t.store, mailer: t.mailer, whatsapp: t.whatsapp, today: TODAY });
    expect(c.newSent).toBe(1);
    expect(c.whatsappSent).toBeUndefined();
    expect(t.whatsapp).not.toHaveBeenCalled();
  });

  it("connected hotel without a manager number: email only", async () => {
    const t = setup({ ...BASE, alert_whatsapp: null, whatsappConnected: true });
    await runBookingAlerts({ store: t.store, mailer: t.mailer, whatsapp: t.whatsapp, today: TODAY });
    expect(t.emails).toHaveLength(1);
    expect(t.whatsapp).not.toHaveBeenCalled();
  });

  it("no WhatsApp sender passed (old callers): email only", async () => {
    const t = setup({ ...BASE, alert_whatsapp: MANAGER, whatsappConnected: true });
    const c = await runBookingAlerts({ store: t.store, mailer: t.mailer, today: TODAY });
    expect(c.newSent).toBe(1);
    expect(c.whatsappSent).toBeUndefined();
  });

  it("cancellation also goes to WhatsApp", async () => {
    const t = setup({ ...BASE, alert_whatsapp: MANAGER, whatsappConnected: true });
    await runBookingAlerts({ store: t.store, mailer: t.mailer, whatsapp: t.whatsapp, today: TODAY });
    t.db.rows.get("r1")!.booking_status = "cancelled";
    const c = await alertBookingsNow({ store: t.store, mailer: t.mailer, whatsapp: t.whatsapp, hotelId: H, ids: ["r1"], today: TODAY });
    expect(c.cancelSent).toBe(1);
    expect(t.whatsapps.map((w) => w.summary)).toEqual([
      "New booking: Ama Mensah, 20–23 Nov, 3 rooms (Entire House) (Airbnb)",
      "Cancelled: Ama Mensah, 20–23 Nov, 3 rooms (Entire House) (Airbnb)",
    ]);
  });

  it("email fails: no WhatsApp either (both retried together next run, never doubled)", async () => {
    const t = setup({ ...BASE, alert_whatsapp: MANAGER, whatsappConnected: true }, [row()], { emailFails: true });
    const c = await runBookingAlerts({ store: t.store, mailer: t.mailer, whatsapp: t.whatsapp, today: TODAY });
    expect(c.failed).toBe(1);
    expect(t.whatsapp).not.toHaveBeenCalled();
  });

  it("WhatsApp fails: email still counts as sent and the booking is not re-alerted", async () => {
    const t = setup({ ...BASE, alert_whatsapp: MANAGER, whatsappConnected: true }, [row()], { whatsappFails: true });
    const c1 = await runBookingAlerts({ store: t.store, mailer: t.mailer, whatsapp: t.whatsapp, today: TODAY });
    expect(c1.newSent).toBe(1);
    expect(c1.failed).toBe(0);
    expect(c1.whatsappSent).toBeUndefined();
    const c2 = await runBookingAlerts({ store: t.store, mailer: t.mailer, whatsapp: t.whatsapp, today: TODAY });
    expect(c2.newSent).toBe(0);
    expect(t.whatsapp).toHaveBeenCalledTimes(1);
    expect(t.emails).toHaveLength(1);
  });

  it("a second run sends nothing again", async () => {
    const t = setup({ ...BASE, alert_whatsapp: MANAGER, whatsappConnected: true });
    await runBookingAlerts({ store: t.store, mailer: t.mailer, whatsapp: t.whatsapp, today: TODAY });
    await runBookingAlerts({ store: t.store, mailer: t.mailer, whatsapp: t.whatsapp, today: TODAY });
    expect(t.whatsapp).toHaveBeenCalledTimes(1);
  });
});

describe("several manager numbers", () => {
  const TWO = "+233551542355, +17032326925";

  it("one template per number, for new bookings and cancellations", async () => {
    const t = setup({ ...BASE, alert_whatsapp: TWO, whatsappConnected: true });
    const c = await runBookingAlerts({ store: t.store, mailer: t.mailer, whatsapp: t.whatsapp, today: TODAY });
    expect(c.newSent).toBe(1);
    expect(c.whatsappSent).toBe(2);
    expect(t.whatsapps.map((w) => w.to)).toEqual(["233551542355", "17032326925"]);
    expect(new Set(t.whatsapps.map((w) => w.summary)).size).toBe(1);
    t.db.rows.get("r1")!.booking_status = "cancelled";
    await alertBookingsNow({ store: t.store, mailer: t.mailer, whatsapp: t.whatsapp, hotelId: H, ids: ["r1"], today: TODAY });
    expect(t.whatsapps.slice(2).map((w) => [w.to, w.summary.split(":")[0]])).toEqual([
      ["233551542355", "Cancelled"],
      ["17032326925", "Cancelled"],
    ]);
  });

  it("one number failing (or throwing) doesn't stop the others, and nothing is re-sent", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const t = setup({ ...BASE, alert_whatsapp: `+447700900123, ${TWO}`, whatsappConnected: true });
    const sentTo: string[] = [];
    const whatsapp: WhatsAppAlerter = vi.fn(async (m) => {
      if (m.to === "447700900123") return { success: false, error: "(#131030) Recipient not in allowed list" };
      if (m.to === "233551542355") throw new Error("network");
      sentTo.push(m.to);
      return { success: true };
    });
    const c1 = await runBookingAlerts({ store: t.store, mailer: t.mailer, whatsapp, today: TODAY });
    expect(whatsapp).toHaveBeenCalledTimes(3);
    expect(sentTo).toEqual(["17032326925"]);
    expect(c1).toMatchObject({ newSent: 1, whatsappSent: 1, failed: 0 });
    await runBookingAlerts({ store: t.store, mailer: t.mailer, whatsapp, today: TODAY });
    expect(whatsapp).toHaveBeenCalledTimes(3);
    errors.mockRestore();
  });
});
