// alert_deliveries: one row per recipient per alert, one insert per alert, and logging
// never stops an alert (also before docs/go-live-alert-deliveries.sql has run).

import { beforeEach, describe, expect, it, vi } from "vitest";
import { runBookingAlerts, sendArrivalsDigest, type AlertHotel, type Mailer, type WhatsAppAlerter } from "./booking-alerts";
import { memoryAlertStore } from "./memory-alert-store.test-helper";
import { memoryHotelBookings } from "@/lib/bookings/memory-store.test-helper";
import type { HotelBookingRow } from "@/lib/bookings/hotel-bookings";

const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ supabase: { from } }));
const { logAlertDeliveries, updateAlertDeliveryStatus } = await import("./delivery-log");

const H = "75218f6b-a953-4b74-b5c8-abd040af21f1";
const TODAY = "2026-11-15";
const HOTEL: AlertHotel = {
  id: H,
  name: "Aracuya",
  slug: "aracuya",
  alert_email: "info@aracuya.com, owner@example.com",
  alert_whatsapp: "+233551542355, +17032326925",
  whatsappConnected: true,
  totalRooms: 3,
};

const row = (over: Partial<HotelBookingRow> = {}): HotelBookingRow =>
  ({
    id: "r1", hotel_id: H, source: "airbnb", external_ref: "ev1", guest_name: "Ama Mensah", phone: null, guest_email: null,
    guests: 2, room_slug: "suite", rooms_count: 3, check_in: "2026-11-16", check_out: "2026-11-18", total_price: 0,
    currency: "GHS", payment_status: "unpaid", payment_provider: null, booking_status: "confirmed", calendar_event_id: null,
    ref_code: null, paid_at: null, ...over,
  }) as HotelBookingRow;

function setup(rows = [row()]) {
  const db = memoryHotelBookings(rows);
  const mem = memoryAlertStore(db.rows, { hotels: [HOTEL] });
  const log = vi.spyOn(mem.store, "logDeliveries");
  const mailer: Mailer = vi.fn(async () => ({ success: true, id: "resend-1" }));
  const whatsapp: WhatsAppAlerter = vi.fn(async (m) =>
    m.to === "17032326925" ? { success: false, error: "(#131030) Recipient not in allowed list" } : { success: true, id: `wamid.${m.to}` }
  );
  return { ...mem, log, mailer, whatsapp };
}

beforeEach(() => {
  vi.restoreAllMocks();
  from.mockReset();
});

describe("delivery rows from the alerts", () => {
  it("2 emails + 2 numbers: 4 rows in one insert; a failed number is a failed row, the others still sent", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const t = setup();
    const c = await runBookingAlerts({ store: t.store, mailer: t.mailer, whatsapp: t.whatsapp, today: TODAY });
    expect(c).toMatchObject({ newSent: 1, whatsappSent: 1 });
    expect(t.log).toHaveBeenCalledTimes(1);
    const base = { hotel_id: H, booking_id: "r1", kind: "new" };
    expect(t.deliveries).toEqual([
      { ...base, channel: "email", recipient: "info@aracuya.com", provider_message_id: "resend-1", status: "sent", error: null },
      { ...base, channel: "email", recipient: "owner@example.com", provider_message_id: "resend-1", status: "sent", error: null },
      { ...base, channel: "whatsapp", recipient: "233551542355", provider_message_id: "wamid.233551542355", status: "sent", error: null },
      { ...base, channel: "whatsapp", recipient: "17032326925", provider_message_id: null, status: "failed", error: "(#131030) Recipient not in allowed list" },
    ]);
  });

  it("failed email: failed rows per address (no WhatsApp), and the digest logs its rows too", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const t = setup();
    const down: Mailer = vi.fn(async () => ({ success: false, error: "resend down" }));
    await runBookingAlerts({ store: t.store, mailer: down, whatsapp: t.whatsapp, today: TODAY });
    expect(t.deliveries.map((d) => [d.channel, d.status, d.error])).toEqual([
      ["email", "failed", "resend down"],
      ["email", "failed", "resend down"],
    ]);
    t.deliveries.length = 0;
    await sendArrivalsDigest({ store: t.store, mailer: t.mailer, tomorrow: "2026-11-16" });
    expect(t.deliveries.map((d) => [d.kind, d.booking_id, d.recipient, d.status])).toEqual([
      ["digest", null, "info@aracuya.com", "sent"],
      ["digest", null, "owner@example.com", "sent"],
    ]);
  });

  it("a failing log write never stops the alert", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const t = setup();
    t.log.mockRejectedValue(new Error("db down"));
    const c = await runBookingAlerts({ store: t.store, mailer: t.mailer, whatsapp: t.whatsapp, today: TODAY });
    expect(c).toMatchObject({ newSent: 1, whatsappSent: 1, failed: 0 });
  });

  it("Airbnb 'Not available' block: nothing sent, nothing logged", async () => {
    const t = setup([row({ guest_name: "Airbnb (Not available)" })]);
    await runBookingAlerts({ store: t.store, mailer: t.mailer, whatsapp: t.whatsapp, today: TODAY });
    expect(t.mailer).not.toHaveBeenCalled();
    expect(t.whatsapp).not.toHaveBeenCalled();
    expect(t.log).not.toHaveBeenCalled();
  });
});

describe("supabase delivery log", () => {
  it("table missing: warns once, never throws", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const insert = vi.fn(async () => ({ error: { code: "42P01", message: 'relation "alert_deliveries" does not exist' } }));
    from.mockReturnValue({ insert });
    const r = { hotel_id: H, booking_id: null, kind: "new", channel: "email", recipient: "a@b.c", provider_message_id: null, status: "sent", error: null } as const;
    await logAlertDeliveries([r]);
    await logAlertDeliveries([r]);
    from.mockImplementation(() => {
      throw { code: "PGRST205", message: "Could not find the table 'public.alert_deliveries' in the schema cache" };
    });
    await expect(updateAlertDeliveryStatus("wamid.1", "read", null)).resolves.toBeUndefined();
    expect(insert).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("webhook status updates the row by wamid, never downgrading; 'sent' is ignored", async () => {
    const calls: unknown[][] = [];
    const q = {
      update: (...a: unknown[]) => (calls.push(["update", ...a]), q),
      eq: (...a: unknown[]) => (calls.push(["eq", ...a]), q),
      in: async (...a: unknown[]) => (calls.push(["in", ...a]), { error: null }),
    };
    from.mockReturnValue(q);
    await updateAlertDeliveryStatus("wamid.1", "delivered", null);
    expect(from).toHaveBeenCalledWith("alert_deliveries");
    expect(calls[0]).toEqual(["update", expect.objectContaining({ status: "delivered", error: null })]);
    expect(calls.slice(1)).toEqual([
      ["eq", "provider_message_id", "wamid.1"],
      ["in", "status", ["sent"]],
    ]);
    calls.length = 0;
    await updateAlertDeliveryStatus("wamid.1", "failed", "131026: undeliverable");
    expect(calls[0]).toEqual(["update", expect.objectContaining({ status: "failed", error: "131026: undeliverable" })]);
    from.mockClear();
    await updateAlertDeliveryStatus("wamid.1", "sent", null);
    expect(from).not.toHaveBeenCalled();
  });
});
