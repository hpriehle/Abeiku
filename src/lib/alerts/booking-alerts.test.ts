import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  alertBookingsNow,
  alertEmailRecipients,
  arrivalsDigestEmail,
  formatDateRange,
  newBookingEmail,
  runBookingAlerts,
  sendArrivalsDigest,
  silenceBackfill,
  type AlertHotel,
  type Mailer,
} from "./booking-alerts";
import { memoryAlertStore } from "./memory-alert-store.test-helper";
import { memoryHotelBookings } from "@/lib/bookings/memory-store.test-helper";
import { parseIcalBookings, syncHotelBookings, type FeedResult, type GoogleEventLike, googleEventToBooking } from "@/lib/bookings/calendar-sync";
import { recordWebBooking } from "@/lib/bookings/web-ingest";
import { groupStays, toCalendarRow } from "@/lib/bookings/calendar-view";
import type { HotelBookingRow } from "@/lib/bookings/hotel-bookings";
import type { BookingReport } from "@/lib/partner/booking-report";

const H = "75218f6b-a953-4b74-b5c8-abd040af21f1";
const TODAY = "2026-11-15";
const HOTEL: AlertHotel = { id: H, name: "Aracuya", slug: "aracuya", alert_email: "info@aracuya.com", totalRooms: 3 };

let n = 0;
function row(over: Partial<HotelBookingRow> & Record<string, unknown> = {}): HotelBookingRow & Record<string, unknown> {
  n++;
  return {
    id: `r${n}`,
    hotel_id: H,
    source: "google_calendar",
    external_ref: `ev${n}`,
    guest_name: "Kwame Asante",
    phone: null,
    guest_email: null,
    guests: null,
    room_slug: "suite",
    rooms_count: 1,
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

function setup(initial: (HotelBookingRow & Record<string, unknown>)[] = [], opts: { missingSchema?: boolean; hotels?: AlertHotel[] } = {}) {
  const db = memoryHotelBookings(initial);
  const alerts = memoryAlertStore(db.rows, { hotels: opts.hotels ?? [HOTEL], missingSchema: opts.missingSchema });
  const sent: { to: string | string[]; subject: string; html: string; text: string }[] = [];
  let failNext = 0;
  const mailer: Mailer = vi.fn(async (msg) => {
    if (failNext > 0) {
      failNext--;
      return { success: false, error: "resend down" };
    }
    sent.push(msg);
    return { success: true };
  });
  return { db, store: alerts.store, feeds: alerts.feeds, sent, mailer, failNextSends: (k: number) => (failNext = k) };
}

const ev = (id: string, summary: string, start: string, end: string, extra: Partial<GoogleEventLike> = {}): GoogleEventLike => ({
  id,
  status: "confirmed",
  summary,
  start: { date: start },
  end: { date: end },
  ...extra,
});
const googleFeed = (events: GoogleEventLike[]): FeedResult => ({
  source: "google_calendar",
  bookings: events.map((e) => googleEventToBooking(e, 3)).filter((b) => b !== null),
});

/** What the booking-sync route does: read synced feeds, sync, silence backfill, sweep. */
async function syncRun(t: ReturnType<typeof setup>, feeds: FeedResult[]) {
  const before = await t.store.syncedFeeds(H);
  await syncHotelBookings({ store: t.db.store, hotelId: H, hotelSlug: "aracuya", feeds, today: TODAY });
  const silenced = await silenceBackfill({
    store: t.store,
    hotelId: H,
    loadedFeeds: feeds.filter((f) => f.bookings).map((f) => f.source),
    syncedBefore: before,
  });
  const counts = await runBookingAlerts({ store: t.store, mailer: t.mailer, today: TODAY });
  return { ...counts, backfill: silenced };
}

beforeEach(() => {
  n = 0;
});

describe("formatting", () => {
  it("date ranges", () => {
    expect(formatDateRange("2026-11-15", "2026-11-18")).toBe("15–18 Nov");
    expect(formatDateRange("2026-11-30", "2026-12-02")).toBe("30 Nov–2 Dec");
    expect(formatDateRange("2026-12-30", "2027-01-02")).toBe("30 Dec 2026–2 Jan 2027");
  });

  it("new booking email: subject, body fields, amount not known for Google, link, no raw HTML from names", () => {
    const stay = groupStays([toCalendarRow(row({ guest_name: "Kwame <b>Asante</b>", check_in: "2026-11-15", check_out: "2026-11-18" }))])[0];
    const m = newBookingEmail(stay, HOTEL);
    expect(m.subject).toBe("New booking: Kwame <b>Asante</b>, 15–18 Nov, 1 room (Google calendar)");
    expect(m.text).toContain("Nights: 3");
    expect(m.text).toContain("Rooms: 1 room");
    expect(m.text).toContain("Guests: Not known");
    expect(m.text).toContain("Amount: Not known (Google calendar doesn't share it)");
    expect(m.text).toContain("Source: Google calendar");
    expect(m.text).toContain("https://abeiku.com/admin/calendar");
    expect(m.html).toContain("Kwame &lt;b&gt;Asante&lt;/b&gt;");
    expect(m.html).not.toContain("<b>Asante");
  });

  it("website booking: amount in GHS with paid status; 3 rooms is the Entire House; MoMo label", () => {
    const r = row({ source: "aracuya_web", rooms_count: 3, total_price: 4500, payment_status: "paid", payment_provider: "momo", guests: 6 });
    const m = newBookingEmail(groupStays([toCalendarRow(r)])[0], HOTEL);
    expect(m.subject).toBe("New booking: Kwame Asante, 20–23 Nov, 3 rooms (Entire House) (MoMo)");
    expect(m.text).toContain("Amount: GHS 4,500 (paid)");
    expect(m.text).toContain("Guests: 6");
  });

  it("subject has no line breaks even if the guest name does", () => {
    const m = newBookingEmail(groupStays([toCalendarRow(row({ guest_name: "Ama\r\nBcc: x@y.z" }))])[0], HOTEL);
    expect(m.subject).not.toMatch(/[\r\n]/);
  });
});

describe("new booking alerts", () => {
  it("fires once per booking: a second run (re-sync) sends nothing", async () => {
    const t = setup([row()]);
    expect((await runBookingAlerts({ store: t.store, mailer: t.mailer, today: TODAY })).newSent).toBe(1);
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0].to).toBe("info@aracuya.com");
    expect(t.sent[0].subject).toBe("New booking: Kwame Asante, 20–23 Nov, 1 room (Google calendar)");
    await runBookingAlerts({ store: t.store, mailer: t.mailer, today: TODAY });
    await runBookingAlerts({ store: t.store, mailer: t.mailer, today: TODAY });
    expect(t.sent).toHaveLength(1);
  });

  it("covers every source: website, Google, iCal, manual, WhatsApp (and old NULL-source rows)", async () => {
    const t = setup([
      row({ source: "aracuya_web", total_price: 1500, payment_status: "paid" }),
      row({ source: "google_calendar", guest_name: "B" }),
      row({ source: "airbnb", guest_name: "C", rooms_count: 3 }),
      row({ source: "manual", guest_name: "D", total_price: 800 }),
      row({ source: "whatsapp", guest_name: "E", total_price: 800 }),
      row({ source: null as unknown as "whatsapp", guest_name: "F", total_price: 800 }),
    ]);
    await runBookingAlerts({ store: t.store, mailer: t.mailer, today: TODAY });
    expect(t.sent.map((s) => s.subject.match(/\(([^()]+)\)$/)![1]).sort()).toEqual(
      ["Airbnb", "Google calendar", "Manual", "WhatsApp", "WhatsApp", "Website"].sort()
    );
  });

  it("rows already marked (by the migration) send nothing", async () => {
    const t = setup([row({ alert_new_sent_at: "2026-11-01T00:00:00Z" }), row({ booking_status: "cancelled", alert_new_sent_at: "x", alert_cancel_sent_at: "x" })]);
    await runBookingAlerts({ store: t.store, mailer: t.mailer, today: TODAY });
    expect(t.sent).toHaveLength(0);
  });

  it("one-night Google entries of one stay make one email", async () => {
    const t = setup([
      row({ check_in: "2026-11-15", check_out: "2026-11-16" }),
      row({ check_in: "2026-11-16", check_out: "2026-11-17" }),
      row({ check_in: "2026-11-17", check_out: "2026-11-18" }),
    ]);
    await runBookingAlerts({ store: t.store, mailer: t.mailer, today: TODAY });
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0].subject).toContain("15–18 Nov");
    expect(t.sent[0].text).toContain("Nights: 3");
  });

  it("a failed email is retried on the next run and then sent once", async () => {
    const t = setup([row()]);
    t.failNextSends(1);
    const first = await runBookingAlerts({ store: t.store, mailer: t.mailer, today: TODAY });
    expect(first).toMatchObject({ newSent: 0, failed: 1 });
    expect((t.db.rows.get("r1") as unknown as Record<string, unknown>).alert_new_sent_at ?? null).toBeNull();
    await runBookingAlerts({ store: t.store, mailer: t.mailer, today: TODAY });
    await runBookingAlerts({ store: t.store, mailer: t.mailer, today: TODAY });
    expect(t.sent).toHaveLength(1);
  });

  it("two runs at the same time still send once (rows are claimed before sending)", async () => {
    const t = setup([row(), row({ guest_name: "Ama" })]);
    await Promise.all([
      runBookingAlerts({ store: t.store, mailer: t.mailer, today: TODAY }),
      runBookingAlerts({ store: t.store, mailer: t.mailer, today: TODAY }),
      alertBookingsNow({ store: t.store, mailer: t.mailer, hotelId: H, ids: ["r1", "r2"], today: TODAY }),
    ]);
    expect(t.sent).toHaveLength(2);
  });

  it("more than 10 new stays at once: one summary email, not a flood (and nothing on re-run)", async () => {
    const many = Array.from({ length: 12 }, (_, i) => row({ guest_name: `Guest ${i}`, check_in: `2026-12-${String(i + 1).padStart(2, "0")}`, check_out: `2026-12-${String(i + 2).padStart(2, "0")}` }));
    const t = setup(many);
    await runBookingAlerts({ store: t.store, mailer: t.mailer, today: TODAY });
    await runBookingAlerts({ store: t.store, mailer: t.mailer, today: TODAY });
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0].subject).toBe("12 new bookings at Aracuya");
    expect(t.sent[0].text).toContain("Guest 11, 12–13 Dec, 1 room (Google calendar)");
  });

  it("a hotel without an alert address gets nothing", async () => {
    const t = setup([row()], { hotels: [] });
    await runBookingAlerts({ store: t.store, mailer: t.mailer, today: TODAY });
    expect(t.sent).toHaveLength(0);
  });

  it("before the SQL runs (columns missing): logs, sends nothing, never throws", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const t = setup([row()], { missingSchema: true });
    expect((await runBookingAlerts({ store: t.store, mailer: t.mailer, today: TODAY })).skipped).toBe("schema-missing");
    expect((await alertBookingsNow({ store: t.store, mailer: t.mailer, hotelId: H, ids: ["r1"], today: TODAY })).skipped).toBe("schema-missing");
    expect((await sendArrivalsDigest({ store: t.store, mailer: t.mailer, tomorrow: "2026-11-20" })).skipped).toBe("schema-missing");
    expect(t.mailer).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("booking-alerts.sql"));
    warn.mockRestore();
  });
});

describe("cancellation alerts", () => {
  it("an announced booking that is cancelled gets one cancellation email", async () => {
    const t = setup([row({ alert_new_sent_at: "2026-11-01T00:00:00Z" })]);
    t.db.rows.get("r1")!.booking_status = "cancelled";
    await runBookingAlerts({ store: t.store, mailer: t.mailer, today: TODAY });
    await runBookingAlerts({ store: t.store, mailer: t.mailer, today: TODAY });
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0].subject).toBe("Cancelled: Kwame Asante, 20–23 Nov, 1 room (Google calendar)");
  });

  it("created and cancelled before any alert: no email at all (and none later)", async () => {
    const t = setup([row({ booking_status: "cancelled" })]);
    const c = await runBookingAlerts({ store: t.store, mailer: t.mailer, today: TODAY });
    expect(c.silenced).toBe(1);
    await runBookingAlerts({ store: t.store, mailer: t.mailer, today: TODAY });
    expect(t.sent).toHaveLength(0);
  });

  it("no cancellation email for a stay that is already over", async () => {
    const t = setup([row({ alert_new_sent_at: "x", booking_status: "cancelled", check_in: "2026-11-01", check_out: "2026-11-03" })]);
    await runBookingAlerts({ store: t.store, mailer: t.mailer, today: TODAY });
    expect(t.sent).toHaveLength(0);
  });
});

describe("with the real calendar sync (C1)", () => {
  const OLD = [
    ev("g1", "2 Rooms - Kofi", "2026-11-20", "2026-11-22"),
    ev("g2", "Entire House - Mensah", "2026-12-01", "2026-12-05"),
    ev("g3", "1 room booked", "2026-11-10", "2026-11-12"),
  ];

  it("the first sync (backfill of old bookings) sends nothing; later new bookings and cancellations alert once each", async () => {
    const t = setup();
    const first = await syncRun(t, [googleFeed(OLD)]);
    expect(first.backfill).toBe(3);
    expect(t.sent).toHaveLength(0);

    // Re-sync, nothing changed.
    await syncRun(t, [googleFeed(OLD)]);
    expect(t.sent).toHaveLength(0);

    // A new booking appears.
    const withNew = [...OLD, ev("g4", "1 Room - Kwame Asante", "2026-11-15", "2026-11-18")];
    await syncRun(t, [googleFeed(withNew)]);
    await syncRun(t, [googleFeed(withNew)]);
    expect(t.sent.map((s) => s.subject)).toEqual(["New booking: 1 Room - Kwame Asante, 15–18 Nov, 1 room (Google calendar)"]);

    // An old (backfilled) booking is removed from the calendar: that cancellation is news.
    const withoutKofi = withNew.filter((e) => e.id !== "g1");
    await syncRun(t, [googleFeed(withoutKofi)]);
    await syncRun(t, [googleFeed(withoutKofi)]);
    expect(t.sent.map((s) => s.subject)).toEqual([
      "New booking: 1 Room - Kwame Asante, 15–18 Nov, 1 room (Google calendar)",
      "Cancelled: 2 Rooms - Kofi, 20–22 Nov, 2 rooms (Google calendar)",
    ]);
  });

  it("an iCal feed added later backfills silently too, while Google keeps alerting", async () => {
    const t = setup();
    await syncRun(t, [googleFeed(OLD)]);
    const airbnb: FeedResult = {
      source: "airbnb",
      bookings: [
        { source: "airbnb", external_ref: "a1", check_in: "2026-12-10", check_out: "2026-12-12", rooms_count: 3, guest_name: "Airbnb · Reserved", phone: null, guest_email: null, guests: null, total_price: null, payment_status: null, payment_provider: "airbnb", calendar_event_id: null },
      ],
    };
    await syncRun(t, [googleFeed([...OLD, ev("g9", "1 Room - Ama", "2026-11-25", "2026-11-26")]), airbnb]);
    expect(t.sent.map((s) => s.subject)).toEqual(["New booking: 1 Room - Ama, 25–26 Nov, 1 room (Google calendar)"]);
  });

  it("a feed that fails to load is not marked synced, so its first good load is still silent", async () => {
    const t = setup();
    await syncRun(t, [{ source: "google_calendar", bookings: null }]);
    await syncRun(t, [googleFeed(OLD)]);
    expect(t.sent).toHaveLength(0);
  });

  it("website report and calendar event of the same booking alert once", async () => {
    const t = setup();
    await syncRun(t, [googleFeed(OLD)]);
    const report: BookingReport = {
      event: "paid",
      booking_ref: "WEB-1",
      guest_name: "Efua Owusu",
      guest_phone: "+233200000000",
      guest_email: "efua@example.com",
      guests: 2,
      rooms_count: 1,
      check_in: "2026-11-28",
      check_out: "2026-11-30",
      total_ghs: 2400,
      room_total_usd: null,
      ref_code: null,
      paid_at: "2026-11-15T10:00:00Z",
    } as unknown as BookingReport;
    const id = await recordWebBooking(t.db.store, { hotelId: H, hotelSlug: "aracuya", report });
    await alertBookingsNow({ store: t.store, mailer: t.mailer, hotelId: H, ids: [id!], today: TODAY });
    // Same booking seen on the calendar (site-created event with props).
    const siteEvent = ev("gweb", "Aracuya · 1 Room · Efua Owusu (paid card)", "2026-11-28", "2026-11-30", {
      extendedProperties: { private: { source: "aracuya-site", bookingId: "WEB-1", rooms: "1", totalGhs: "2400", status: "confirmed" } },
    });
    await syncRun(t, [googleFeed([...OLD, siteEvent])]);
    expect(t.sent.map((s) => s.subject)).toEqual(["New booking: Efua Owusu, 28–30 Nov, 1 room (Website)"]);
    expect(t.sent[0].text).toContain("Amount: GHS 2,400 (paid)");

    // The website cancels it: one cancellation email.
    const cancelId = await recordWebBooking(t.db.store, { hotelId: H, hotelSlug: "aracuya", report: { ...report, event: "cancelled" } as BookingReport });
    await alertBookingsNow({ store: t.store, mailer: t.mailer, hotelId: H, ids: [cancelId!], today: TODAY });
    await syncRun(t, [googleFeed([...OLD, siteEvent])]);
    expect(t.sent.map((s) => s.subject)).toEqual([
      "New booking: Efua Owusu, 28–30 Nov, 1 room (Website)",
      "Cancelled: Efua Owusu, 28–30 Nov, 1 room (Website)",
    ]);
  });
});

describe("OTA calendar blocks (Airbnb 'Not available')", () => {
  const vevent = (uid: string, summary: string, start: string, end: string) =>
    `BEGIN:VEVENT\nUID:${uid}\nDTSTART;VALUE=DATE:${start.replace(/-/g, "")}\nDTEND;VALUE=DATE:${end.replace(/-/g, "")}\nSUMMARY:${summary}\nEND:VEVENT`;
  const airbnbFeed = (...events: string[]): FeedResult => ({ source: "airbnb", bookings: parseIcalBookings(events.join("\n"), "airbnb", 3) });
  const RESERVED = vevent("a-res", "Reserved", "2026-12-10", "2026-12-12");
  const WINDOW_END = vevent("a-blk1", "Airbnb (Not available)", "2027-11-17", "2027-11-18");

  it("the rolling 'Not available' day never alerts (email or WhatsApp); a new reservation does, once", async () => {
    const t = setup([], { hotels: [{ ...HOTEL, alert_whatsapp: "+233551542355", whatsappConnected: true }] });
    const whatsapps: string[] = [];
    const whatsapp = vi.fn(async (m: { summary: string }) => (whatsapps.push(m.summary), { success: true }));
    const run = async (feed: FeedResult) => {
      const before = await t.store.syncedFeeds(H);
      await syncHotelBookings({ store: t.db.store, hotelId: H, hotelSlug: "aracuya", feeds: [feed], today: TODAY });
      await silenceBackfill({ store: t.store, hotelId: H, loadedFeeds: ["airbnb"], syncedBefore: before });
      return runBookingAlerts({ store: t.store, mailer: t.mailer, today: TODAY, whatsapp });
    };
    await run(airbnbFeed(WINDOW_END)); // first sync: backfill
    // Next day: the window moves one day further, the host blocks a week, and a guest books.
    const nextDay = airbnbFeed(
      WINDOW_END,
      vevent("a-blk2", "Airbnb (Not available)", "2027-11-18", "2027-11-19"),
      vevent("a-blk3", "Not available", "2026-12-20", "2026-12-27"),
      RESERVED
    );
    const c = await run(nextDay);
    await run(nextDay);
    expect(t.sent.map((s) => s.subject)).toEqual(["New booking: Airbnb · Reserved, 10–12 Dec, 3 rooms (Entire House) (Airbnb)"]);
    expect(whatsapps).toHaveLength(1);
    expect(c.silenced).toBe(2);

    // Blocks still take the rooms: stored, not cancelled.
    const blocks = [...t.db.rows.values()].filter((r) => r.external_ref.startsWith("a-blk"));
    expect(blocks).toHaveLength(3);
    expect(blocks.every((r) => r.booking_status === "confirmed" && r.rooms_count === 3)).toBe(true);

    // The host unblocks: the sync cancels the row, but no cancellation alert.
    await run(airbnbFeed(WINDOW_END, vevent("a-blk2", "Airbnb (Not available)", "2027-11-18", "2027-11-19"), RESERVED));
    expect(t.db.rows.get(blocks.find((r) => r.external_ref === "a-blk3")!.id)!.booking_status).toBe("cancelled");
    expect(t.sent).toHaveLength(1);
    expect(whatsapps).toHaveLength(1);
  });

  it("a block row already in the table (synced before this fix) is silenced, not alerted", async () => {
    const t = setup([
      row({ source: "airbnb", guest_name: "Airbnb · Airbnb (Not available)", check_in: "2027-11-18", check_out: "2027-11-19", rooms_count: 3 }),
      row({ source: "airbnb", guest_name: "Airbnb · Reserved", rooms_count: 3 }),
    ]);
    const c = await runBookingAlerts({ store: t.store, mailer: t.mailer, today: TODAY });
    expect(c).toMatchObject({ newSent: 1, silenced: 1 });
    expect(t.sent.map((s) => s.subject)).toEqual(["New booking: Airbnb · Reserved, 20–23 Nov, 3 rooms (Entire House) (Airbnb)"]);
    // An already-announced block that is cancelled: no cancellation email either.
    const u = setup([row({ source: "vrbo", guest_name: "VRBO · Blocked", booking_status: "cancelled", alert_new_sent_at: "x" })]);
    await alertBookingsNow({ store: u.store, mailer: u.mailer, hotelId: H, ids: ["r3"], today: TODAY });
    await runBookingAlerts({ store: u.store, mailer: u.mailer, today: TODAY });
    expect(u.sent).toHaveLength(0);
  });

  it("blocks are left out of the arrivals digest", async () => {
    const t = setup([
      row({ source: "airbnb", guest_name: "Airbnb · Airbnb (Not available)", check_in: "2026-11-16", check_out: "2026-11-17", rooms_count: 3 }),
      row({ source: "booking_com", guest_name: "Booking.com · CLOSED - Not available", check_in: "2026-11-16", check_out: "2026-11-18", rooms_count: 3 }),
    ]);
    expect(await sendArrivalsDigest({ store: t.store, mailer: t.mailer, tomorrow: "2026-11-16" })).toMatchObject({ sent: 0, empty: 1 });
    const u = setup([
      row({ source: "airbnb", guest_name: "Airbnb · Airbnb (Not available)", check_in: "2026-11-16", check_out: "2026-11-17", rooms_count: 3 }),
      row({ guest_name: "Arrives A", check_in: "2026-11-16", check_out: "2026-11-17" }),
    ]);
    await sendArrivalsDigest({ store: u.store, mailer: u.mailer, tomorrow: "2026-11-16" });
    expect(u.sent[0].subject).toBe("Arriving tomorrow (Mon 16 Nov 2026): 1 booking, 1 room");
    expect(u.sent[0].text).not.toContain("Not available");
  });

  it("Google calendar events and website bookings with block-like names still alert as before", async () => {
    const t = setup([row({ source: "google_calendar", guest_name: "Blocked" }), row({ source: "aracuya_web", guest_name: "Not available", total_price: 900 })]);
    const c = await runBookingAlerts({ store: t.store, mailer: t.mailer, today: TODAY });
    expect(c).toMatchObject({ newSent: 2, silenced: 0 });
  });
});

describe("arrivals digest", () => {
  it("lists tomorrow's arrivals once per date; cancelled and continuing stays are left out", async () => {
    const t = setup([
      row({ guest_name: "Arrives A", check_in: "2026-11-16", check_out: "2026-11-18", rooms_count: 2 }),
      row({ guest_name: "Arrives B", source: "aracuya_web", check_in: "2026-11-16", check_out: "2026-11-17", total_price: 1200, payment_status: "paid" }),
      row({ guest_name: "Cancelled C", check_in: "2026-11-16", check_out: "2026-11-17", booking_status: "cancelled" }),
      // One-night entries of a stay that began today: tomorrow's row is not an arrival.
      row({ guest_name: "Staying D", check_in: "2026-11-15", check_out: "2026-11-16" }),
      row({ guest_name: "Staying D", check_in: "2026-11-16", check_out: "2026-11-17" }),
    ]);
    const first = await sendArrivalsDigest({ store: t.store, mailer: t.mailer, tomorrow: "2026-11-16" });
    const again = await sendArrivalsDigest({ store: t.store, mailer: t.mailer, tomorrow: "2026-11-16" });
    expect(first.sent).toBe(1);
    expect(again).toMatchObject({ sent: 0, already: 1 });
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0].subject).toBe("Arriving tomorrow (Mon 16 Nov 2026): 2 bookings, 3 rooms (Entire House)");
    expect(t.sent[0].text).toContain("Guest: Arrives A");
    expect(t.sent[0].text).toContain("Guest: Arrives B");
    expect(t.sent[0].text).not.toContain("Cancelled C");
    expect(t.sent[0].text).not.toContain("Staying D");
  });

  it("no arrivals: no email", async () => {
    const t = setup([row({ check_in: "2026-11-20" })]);
    expect(await sendArrivalsDigest({ store: t.store, mailer: t.mailer, tomorrow: "2026-11-16" })).toMatchObject({ sent: 0, empty: 1 });
    expect(t.sent).toHaveLength(0);
  });

  it("a failed digest is retried by the next call", async () => {
    const t = setup([row({ check_in: "2026-11-16" })]);
    t.failNextSends(1);
    expect((await sendArrivalsDigest({ store: t.store, mailer: t.mailer, tomorrow: "2026-11-16" })).failed).toBe(1);
    expect((await sendArrivalsDigest({ store: t.store, mailer: t.mailer, tomorrow: "2026-11-16" })).sent).toBe(1);
    expect(t.sent).toHaveLength(1);
  });

  it("digest email body is plain and short", () => {
    const stays = groupStays([toCalendarRow(row({ check_in: "2026-11-16" }))]);
    const m = arrivalsDigestEmail(stays, "2026-11-16", HOTEL);
    expect(m.subject).toBe("Arriving tomorrow (Mon 16 Nov 2026): 1 booking, 1 room");
    expect(m.text.split("\n").length).toBeLessThan(20);
  });
});

describe("several alert recipients (comma-separated alert_email)", () => {
  it("one address: sent to exactly that address, as before", async () => {
    const t = setup([row()]);
    await runBookingAlerts({ store: t.store, mailer: t.mailer, today: TODAY });
    expect(t.sent.map((m) => m.to)).toEqual(["info@aracuya.com"]);
  });

  it("two addresses: new booking, cancellation and digest each go to both, in one email", async () => {
    const hotel = { ...HOTEL, alert_email: "info@aracuya.com, owner@example.com" };
    const t = setup([row({ check_in: "2026-11-16", check_out: "2026-11-18" })], { hotels: [hotel] });
    await runBookingAlerts({ store: t.store, mailer: t.mailer, today: TODAY });
    await sendArrivalsDigest({ store: t.store, mailer: t.mailer, tomorrow: "2026-11-16" });
    t.db.rows.get("r1")!.booking_status = "cancelled";
    await alertBookingsNow({ store: t.store, mailer: t.mailer, hotelId: H, ids: ["r1"], today: TODAY });
    expect(t.sent.map((m) => m.subject.split(":")[0])).toEqual(["New booking", "Arriving tomorrow (Mon 16 Nov 2026)", "Cancelled"]);
    for (const m of t.sent) expect(m.to).toEqual(["info@aracuya.com", "owner@example.com"]);
  });

  it("tolerates spaces, semicolons, empty entries and duplicates; skips entries that aren't addresses", () => {
    expect(alertEmailRecipients(" a@inn.gh ;b@inn.gh,, a@inn.gh , junk ")).toEqual(["a@inn.gh", "b@inn.gh"]);
    expect(alertEmailRecipients("info@aracuya.com")).toEqual(["info@aracuya.com"]);
    expect(alertEmailRecipients(null)).toEqual([]);
  });
});
