import { describe, expect, it } from "vitest";
import {
  googleEventToBooking,
  icalSourceForUrl,
  parseIcalBookings,
  parseRoomsCount,
  syncHotelBookings,
  type FeedResult,
  type GoogleEventLike,
} from "./calendar-sync";
import type { HotelBookingRow } from "./hotel-bookings";
import { isBlockSummary, isCalendarBlock } from "./calendar-view";
import { memoryHotelBookings } from "./memory-store.test-helper";

const H = "hotel-1";
const TODAY = "2026-11-15";

const allDay = (id: string, summary: string, start: string, end: string, extra: Partial<GoogleEventLike> = {}): GoogleEventLike => ({
  id,
  status: "confirmed",
  summary,
  start: { date: start },
  end: { date: end },
  ...extra,
});

describe("rooms count", () => {
  it("reads rooms=<n>, then the summary, else the whole house", () => {
    expect(parseRoomsCount("anything", { rooms: "2" }, 3)).toBe(2);
    expect(parseRoomsCount("x", { rooms: "9" }, 3)).toBe(3);
    expect(parseRoomsCount("Aracuya · 1 Room · Ama (paid card)", null, 3)).toBe(1);
    expect(parseRoomsCount("2 Rooms - Kofi", null, 3)).toBe(2);
    expect(parseRoomsCount("1 room booked", null, 3)).toBe(1);
    expect(parseRoomsCount("Aracuya · Entire House · Ama (paid MoMo)", null, 3)).toBe(3);
    expect(parseRoomsCount("Kofi family", null, 3)).toBe(3);
    expect(parseRoomsCount("", null, 3)).toBe(3);
  });
});

describe("Google Calendar events", () => {
  it("skips HOLD events (by summary or status=hold), cancelled ones, and slots with no night", () => {
    expect(googleEventToBooking(allDay("e1", "HOLD · 1 Room · Ama (awaiting payment)", "2026-12-01", "2026-12-02"), 3)).toBeNull();
    expect(googleEventToBooking(allDay("e2", "x", "2026-12-01", "2026-12-02", { extendedProperties: { private: { status: "hold" } } }), 3)).toBeNull();
    expect(googleEventToBooking(allDay("e3", "x", "2026-12-01", "2026-12-02", { status: "cancelled" }), 3)).toBeNull();
    const cleaning: GoogleEventLike = { id: "e4", summary: "Cleaning", start: { dateTime: "2026-12-01T10:00:00Z" }, end: { dateTime: "2026-12-01T12:00:00Z" } };
    expect(googleEventToBooking(cleaning, 3)).toBeNull();
  });

  it("a staff entry 00:00–00:00 is one night; label sets the rooms", () => {
    const e: GoogleEventLike = { id: "m1", summary: "1 room booked", start: { dateTime: "2026-12-05T00:00:00Z" }, end: { dateTime: "2026-12-06T00:00:00Z" } };
    expect(googleEventToBooking(e, 3)).toMatchObject({
      source: "google_calendar",
      external_ref: "m1",
      check_in: "2026-12-05",
      check_out: "2026-12-06",
      rooms_count: 1,
      guest_name: "1 room booked",
      phone: null,
    });
  });

  it("an event the website created is keyed like the website report (aracuya_web + bookingId)", () => {
    const e = allDay("g9", "Aracuya · 2 Rooms · Ama Mensah (paid MoMo)", "2027-01-10", "2027-01-12", {
      extendedProperties: {
        private: {
          source: "aracuya-site", bookingId: "ARC-77", rooms: "2", status: "confirmed", provider: "momo",
          guestName: "Ama Mensah", guestEmail: "ama@example.com", guestPhone: "+233 1", guests: "3", totalGhs: "2700",
        },
      },
    });
    expect(googleEventToBooking(e, 3)).toMatchObject({
      source: "aracuya_web",
      external_ref: "ARC-77",
      rooms_count: 2,
      guests: 3,
      total_price: 2700,
      payment_status: "paid",
      payment_provider: "momo",
      calendar_event_id: "g9",
    });
  });
});

describe("iCal feeds", () => {
  const ics = [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT",
    "DTSTART;VALUE=DATE:20270109",
    "DTEND;VALUE=DATE:20270116",
    "UID:abc-123@airbnb.com",
    "SUMMARY:Reserved",
    "DESCRIPTION:Reservation URL: https://www.airbnb.com/hosting/reservations/details/X\\nPhone",
    "  Number (Last 4 Digits): 1234",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "DTSTART;VALUE=DATE:20271115",
    "DTEND;VALUE=DATE:20271116",
    "UID:def-456@airbnb.com",
    "SUMMARY:Airbnb (Not available)",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "DTSTART;VALUE=DATE:20270201",
    "DTEND;VALUE=DATE:20270201",
    "UID:zero-nights",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  it("every event is a whole-house booking keyed by UID", () => {
    const out = parseIcalBookings(ics, "airbnb", 3);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      source: "airbnb",
      external_ref: "abc-123@airbnb.com",
      check_in: "2027-01-09",
      check_out: "2027-01-16",
      rooms_count: 3,
      guest_name: "Airbnb · Reserved",
      phone: null,
    });
    expect(out[1].guest_name).toBe("Airbnb · Airbnb (Not available)");
  });

  it("Airbnb 'Not available' is a calendar block; Airbnb 'Reserved' stays a booking", () => {
    const [reserved, notAvailable] = parseIcalBookings(ics, "airbnb", 3);
    expect(isCalendarBlock(notAvailable)).toBe(true);
    expect(isCalendarBlock(reserved)).toBe(false);
    // Blocks still take the whole house (availability unchanged).
    expect(notAvailable.rooms_count).toBe(3);
  });

  it("block summaries from each OTA, case-insensitive; reservations and guest names are not blocks", () => {
    for (const s of ["Not available", "Airbnb (Not available)", "Blocked", "CLOSED - Not available", "closed - not available", "Unavailable"]) {
      expect(isBlockSummary(s)).toBe(true);
    }
    for (const s of ["Reserved", "Airbnb (Reserved)", "Reserved - Ama", "Kwame Asante", ""]) {
      expect(isBlockSummary(s)).toBe(false);
    }
    const one = (summary: string, source: "airbnb" | "vrbo" | "booking_com") =>
      parseIcalBookings(`BEGIN:VEVENT\nUID:u1\nDTSTART:20261204\nDTEND:20261206\nSUMMARY:${summary}\nEND:VEVENT`, source, 3)[0];
    expect(isCalendarBlock(one("Blocked", "vrbo"))).toBe(true);
    expect(isCalendarBlock(one("CLOSED - Not available", "booking_com"))).toBe(true);
    expect(isCalendarBlock(one("Reserved - Ama", "vrbo"))).toBe(false);
    expect(isCalendarBlock(one("Airbnb (Reserved)", "airbnb"))).toBe(false);
  });

  it("Google calendar and website rows are never blocks, whatever the summary", () => {
    const g = googleEventToBooking(allDay("g1", "Blocked - Not available", "2026-12-01", "2026-12-02"), 3)!;
    expect(g.source).toBe("google_calendar");
    expect(isCalendarBlock(g)).toBe(false);
    expect(isCalendarBlock({ source: "aracuya_web", guest_name: "Not available" })).toBe(false);
  });

  it("VRBO 'Reserved - Name' gives the guest's first name", () => {
    const v = "BEGIN:VEVENT\nUID:u1\nDTSTART:20261204\nDTEND:20261206\nSUMMARY:Reserved - Ama\nEND:VEVENT";
    expect(parseIcalBookings(v, "vrbo", 3)[0]).toMatchObject({ guest_name: "Ama", check_in: "2026-12-04", check_out: "2026-12-06" });
  });

  it("maps export hosts to sources", () => {
    expect(icalSourceForUrl("https://www.airbnb.com/calendar/ical/1.ics?s=x")).toBe("airbnb");
    expect(icalSourceForUrl("https://www.vrbo.com/icalendar/x.ics")).toBe("vrbo");
    expect(icalSourceForUrl("https://ical.booking.com/v1/export?t=x")).toBe("booking_com");
    expect(icalSourceForUrl("https://example.com/x.ics")).toBeNull();
  });
});

describe("sync", () => {
  const webRow = (over: Partial<HotelBookingRow> = {}): HotelBookingRow => ({
    id: "w1", hotel_id: H, source: "aracuya_web", external_ref: "ARC-1", guest_name: "Ama Mensah",
    phone: "+233 1", guest_email: "ama@example.com", guests: 2, room_slug: "suite", rooms_count: 1,
    check_in: "2026-12-10", check_out: "2026-12-12", total_price: 1400, currency: "GHS",
    payment_status: "paid", payment_provider: "stripe", booking_status: "confirmed",
    calendar_event_id: null, ref_code: null, paid_at: null, ...over,
  });
  const google = (...events: GoogleEventLike[]): FeedResult => ({
    source: "google_calendar",
    bookings: events.map((e) => googleEventToBooking(e, 3)).filter((b) => b !== null),
  });
  const run = (mem: ReturnType<typeof memoryHotelBookings>, feeds: FeedResult[], today = TODAY) =>
    syncHotelBookings({ store: mem.store, hotelId: H, hotelSlug: "aracuya", feeds, today });

  it("inserts calendar + iCal bookings, skips HOLDs, and a second run changes nothing", async () => {
    const mem = memoryHotelBookings();
    const feeds: FeedResult[] = [
      google(
        allDay("m1", "2 Rooms - Kofi", "2026-12-01", "2026-12-03"),
        allDay("h1", "HOLD · 1 Room · X (awaiting payment)", "2026-12-01", "2026-12-02")
      ),
      { source: "vrbo", bookings: parseIcalBookings("BEGIN:VEVENT\nUID:v1\nDTSTART:20261220\nDTEND:20261222\nSUMMARY:Blocked\nEND:VEVENT", "vrbo", 3) },
    ];
    expect(await run(mem, feeds)).toMatchObject({ inserted: 2, cancelled: 0 });
    expect(mem.all().map((r) => [r.source, r.external_ref, r.rooms_count, r.room_slug])).toEqual([
      ["google_calendar", "m1", 2, "suite"],
      ["vrbo", "v1", 3, "suite"],
    ]);
    const writes = mem.writes();
    expect(await run(mem, feeds)).toMatchObject({ inserted: 0, updated: 0, unchanged: 2 });
    expect(mem.writes()).toBe(writes);
  });

  it("a web booking on the calendar (summary only) is matched to its aracuya_web row, not doubled", async () => {
    const mem = memoryHotelBookings([webRow()]);
    const feeds = [google(allDay("g1", "Aracuya · 1 Room · Ama Mensah (paid card)", "2026-12-10", "2026-12-12"))];
    expect(await run(mem, feeds)).toMatchObject({ inserted: 0, matchedWeb: 1 });
    expect(mem.all()).toHaveLength(1);
    expect(mem.all()[0]).toMatchObject({ source: "aracuya_web", calendar_event_id: "g1" });
    // Next run: still one row, matched through the stored event id.
    expect(await run(mem, feeds)).toMatchObject({ inserted: 0, matchedWeb: 1 });
    expect(mem.all()).toHaveLength(1);
  });

  it("a web booking event with props shares the website's key, whichever arrives first", async () => {
    const event = allDay("g2", "Aracuya · 1 Room · Ama Mensah (paid card)", "2026-12-10", "2026-12-12", {
      extendedProperties: { private: { source: "aracuya-site", bookingId: "ARC-1", rooms: "1", status: "confirmed", provider: "stripe", guestName: "Ama Mensah" } },
    });
    const mem = memoryHotelBookings([webRow()]);
    await run(mem, [google(event)]);
    expect(mem.all()).toHaveLength(1);
    expect(mem.all()[0]).toMatchObject({ calendar_event_id: "g2", total_price: 1400, payment_provider: "stripe" });

    // Calendar first (e.g. MoMo, never reported): one aracuya_web row from the sync.
    const mem2 = memoryHotelBookings();
    await run(mem2, [google(event)]);
    expect(mem2.all()).toEqual([expect.objectContaining({ source: "aracuya_web", external_ref: "ARC-1", booking_status: "confirmed" })]);
  });

  it("does not match a web row with other dates or another guest", async () => {
    const mem = memoryHotelBookings([webRow()]);
    await run(mem, [google(allDay("g3", "Aracuya · 1 Room · Kofi Boateng (paid card)", "2026-12-10", "2026-12-12"))]);
    expect(mem.all()).toHaveLength(2);
  });

  it("events gone from a feed are marked cancelled, never deleted; past stays and failed feeds are left alone", async () => {
    const mem = memoryHotelBookings();
    const ics = (uids: string[]) =>
      uids.map((u) => `BEGIN:VEVENT\nUID:${u}\nDTSTART:20261201\nDTEND:20261203\nEND:VEVENT`).join("\n");
    await run(mem, [
      google(allDay("m1", "1 room", "2026-12-01", "2026-12-02"), allDay("old", "1 room", "2026-11-01", "2026-11-02")),
      { source: "airbnb", bookings: parseIcalBookings(ics(["a1"]), "airbnb", 3) },
      { source: "booking_com", bookings: parseIcalBookings(ics(["b1"]), "booking_com", 3) },
    ], "2026-10-20");
    expect(mem.all()).toHaveLength(4);

    // m1, old and a1 disappear; booking.com fails to load.
    const res = await run(mem, [google(), { source: "airbnb", bookings: [] }, { source: "booking_com", bookings: null }]);
    expect(res).toMatchObject({ cancelled: 2, failedFeeds: ["booking_com"] });
    const status = Object.fromEntries(mem.all().map((r) => [r.external_ref, r.booking_status]));
    expect(status).toEqual({ m1: "cancelled", old: "confirmed", a1: "cancelled", b1: "confirmed" });

    // Back in the feed → confirmed again.
    await run(mem, [google(allDay("m1", "1 room", "2026-12-01", "2026-12-02"))]);
    expect(mem.all().find((r) => r.external_ref === "m1")?.booking_status).toBe("confirmed");
  });

  it("a web booking is cancelled by the calendar only once linked to an event", async () => {
    const mem = memoryHotelBookings([webRow(), webRow({ id: "w2", external_ref: "ARC-2", calendar_event_id: "g7" })]);
    expect(await run(mem, [google()])).toMatchObject({ cancelled: 1 });
    expect(mem.all().map((r) => r.booking_status)).toEqual(["confirmed", "cancelled"]);
  });

  it("an OTA that re-issues a UID keeps the same row", async () => {
    const mem = memoryHotelBookings();
    const feed = (uid: string): FeedResult => ({
      source: "booking_com",
      bookings: parseIcalBookings(`BEGIN:VEVENT\nUID:${uid}\nDTSTART:20261207\nDTEND:20261209\nEND:VEVENT`, "booking_com", 3),
    });
    await run(mem, [feed("u-old")]);
    expect(await run(mem, [feed("u-new")])).toMatchObject({ inserted: 0, cancelled: 0 });
    expect(mem.all()).toEqual([expect.objectContaining({ external_ref: "u-new", booking_status: "confirmed" })]);
  });
});
