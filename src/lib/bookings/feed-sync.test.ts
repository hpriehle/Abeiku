import { beforeEach, describe, expect, it, vi } from "vitest";
import { syncFeedHotels, type FeedHotel, type FeedSyncStore } from "./feed-sync";
import { limitedMap, validateFeedInput, signupLinksToFeeds, shouldSyncHotel, type FeedStatus, type HotelFeed } from "./hotel-feeds";
import { memoryHotelBookings } from "./memory-store.test-helper";
import { syncHotelBookings, type FeedResult, googleEventToBooking } from "./calendar-sync";
import { memoryAlertStore } from "@/lib/alerts/memory-alert-store.test-helper";
import { runBookingAlerts, silenceBackfill, type AlertHotel, type Mailer } from "@/lib/alerts/booking-alerts";

const TODAY = "2026-11-15";
const ARACUYA = "75218f6b-a953-4b74-b5c8-abd040af21f1";
const H1 = "11111111-1111-1111-1111-111111111111";
const H2 = "22222222-2222-2222-2222-222222222222";

const AIRBNB_A = "https://www.airbnb.com/calendar/ical/111.ics?s=tokenA";
const AIRBNB_B = "https://www.airbnb.com/calendar/ical/222.ics?s=tokenB";
const BOOKING = "https://ical.booking.com/v1/export?t=tokenC";
const VRBO = "https://www.vrbo.com/icalendar/333.ics";

function ics(events: { uid: string; start: string; end: string; summary?: string }[]) {
  const d = (s: string) => s.replace(/-/g, "");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    ...events.flatMap((e) => [
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTART;VALUE=DATE:${d(e.start)}`,
      `DTEND;VALUE=DATE:${d(e.end)}`,
      `SUMMARY:${e.summary ?? "Reserved"}`,
      "END:VEVENT",
    ]),
    "END:VCALENDAR",
  ].join("\r\n");
}

/** fetch mock: url → body | status | "hang" | "huge" | "html". */
type Reply = string | number | "hang" | "huge" | "html";
function mockFetch(routes: Record<string, Reply>) {
  const calls: string[] = [];
  const fn = vi.fn(async (url: string, init?: RequestInit): Promise<Response> => {
    calls.push(url);
    const r = routes[url];
    if (r === undefined) throw new TypeError("fetch failed");
    if (r === "hang") {
      return new Promise((_, reject) => {
        init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("timed out"), { name: "TimeoutError" })));
      });
    }
    if (r === "huge") return new Response("BEGIN:VCALENDAR\r\n" + "X".repeat(5_000), { status: 200 });
    if (r === "html") return new Response("<!doctype html><html>Log in</html>", { status: 200 });
    if (typeof r === "number") return new Response("nope", { status: r });
    return new Response(r, { status: 200, headers: { "content-type": "text/calendar" } });
  });
  return { fn, calls };
}

let seq = 0;
function feed(hotelId: string, kind: HotelFeed["kind"], url: string, over: Partial<HotelFeed> = {}): HotelFeed {
  return {
    id: `f${++seq}`,
    hotel_id: hotelId,
    kind,
    url,
    room_slug: null,
    last_synced_at: null,
    last_error: null,
    last_error_at: null,
    last_count: null,
    ...over,
  };
}

const trialing = { billing_status: "trialing", trial_ends_at: "2026-12-10T00:00:00Z", active: true };

function feedStore(hotels: FeedHotel[], rooms: Record<string, { slug: string; units: number }[]> = {}) {
  const statuses = new Map<string, FeedStatus[]>();
  const store: FeedSyncStore = {
    async listFeedHotels() {
      return hotels;
    },
    async roomsOf(hotelId) {
      return rooms[hotelId] ?? [];
    },
    async recordStatus(feedId, s) {
      statuses.set(feedId, [...(statuses.get(feedId) ?? []), s]);
    },
  };
  return { store, statuses, last: (id: string) => statuses.get(id)?.at(-1) };
}

function setup(hotels: FeedHotel[], routes: Record<string, Reply>, rooms?: Record<string, { slug: string; units: number }[]>) {
  const db = memoryHotelBookings();
  const fs = feedStore(hotels, rooms);
  const net = mockFetch(routes);
  const alertHotels: AlertHotel[] = hotels.map((h) => ({ id: h.id, name: h.slug, slug: h.slug, alert_email: `${h.slug}@example.com`, totalRooms: 3 }));
  const alerts = memoryAlertStore(db.rows, { hotels: alertHotels });
  const sent: { to: string; subject: string }[] = [];
  const mailer: Mailer = vi.fn(async (msg) => {
    sent.push(msg);
    return { success: true };
  });
  const run = async (opts: { now?: () => number; readDeadline?: number; writeDeadline?: number; maxFeeds?: number; icalTimeoutMs?: number } = {}) => {
    const summary = await syncFeedHotels({
      store: fs.store,
      bookings: db.store,
      syncedFeeds: (id) => alerts.store.syncedFeeds(id),
      read: { today: TODAY, fetchImpl: net.fn, listGoogle: null, icalTimeoutMs: opts.icalTimeoutMs ?? 50, icalMaxBytes: 2_000 },
      excludeHotelIds: [ARACUYA],
      readDeadline: opts.readDeadline ?? Number.MAX_SAFE_INTEGER,
      writeDeadline: opts.writeDeadline ?? Number.MAX_SAFE_INTEGER,
      now: opts.now,
      maxFeeds: opts.maxFeeds,
    });
    // What the route does afterwards: each hotel's backfill silenced, then one sweep.
    for (const a of summary.alertInputs) {
      await silenceBackfill({ store: alerts.store, hotelId: a.hotelId, loadedFeeds: a.loadedFeeds, syncedBefore: a.syncedBefore ?? new Set() });
    }
    const counts = await runBookingAlerts({ store: alerts.store, mailer, today: TODAY });
    return { summary, counts };
  };
  return { db, fs, net, sent, run, routes };
}

beforeEach(() => {
  seq = 0;
});

describe("who is synced", () => {
  it("trial, paid, past due, cancelled-but-still-open and exempt hotels; not pending card, ended, legacy or inactive", () => {
    expect(shouldSyncHotel({ billing_status: "trialing", trial_ends_at: "2026-12-10T00:00:00Z" })).toBe(true);
    expect(shouldSyncHotel({ billing_status: "active" })).toBe(true);
    expect(shouldSyncHotel({ billing_status: "past_due" })).toBe(true);
    expect(shouldSyncHotel({ billing_exempt: true })).toBe(true);
    expect(shouldSyncHotel({ billing_status: "canceled", current_period_end: "2099-01-01T00:00:00Z" })).toBe(true);
    expect(shouldSyncHotel({ billing_status: "canceled", current_period_end: "2020-01-01T00:00:00Z" })).toBe(false);
    expect(shouldSyncHotel({ billing_status: "pending_card" })).toBe(false);
    expect(shouldSyncHotel({ billing_status: null })).toBe(false);
    expect(shouldSyncHotel({ billing_status: "active", active: false })).toBe(false);
  });
});

describe("multi-hotel sync", () => {
  it("syncs each eligible hotel's feeds into its own bookings, tags rows with the feed and room, records status", async () => {
    const a1 = feed(H1, "airbnb", AIRBNB_A, { room_slug: "garden" });
    const b1 = feed(H1, "booking_com", BOOKING);
    const v2 = feed(H2, "vrbo", VRBO);
    const dead = feed("33333333-3333-3333-3333-333333333333", "airbnb", AIRBNB_B);
    const hotels: FeedHotel[] = [
      { id: H1, slug: "palm-lodge", hotel: trialing, feeds: [a1, b1] },
      { id: H2, slug: "volta-view", hotel: { billing_status: "active", active: true }, feeds: [v2] },
      { id: "33333333-3333-3333-3333-333333333333", slug: "never-paid", hotel: { billing_status: "pending_card" }, feeds: [dead] },
      { id: ARACUYA, slug: "aracuya", hotel: { billing_exempt: true }, feeds: [feed(ARACUYA, "airbnb", "https://www.airbnb.com/calendar/ical/999.ics")] },
    ];
    const t = setup(
      hotels,
      {
        [AIRBNB_A]: ics([{ uid: "a-1", start: "2026-11-20", end: "2026-11-23" }]),
        [BOOKING]: ics([{ uid: "b-1", start: "2026-12-01", end: "2026-12-04", summary: "CLOSED - Not available" }]),
        [VRBO]: ics([
          { uid: "v-1", start: "2026-11-18", end: "2026-11-19", summary: "Reserved - Ama" },
          { uid: "v-2", start: "2026-12-24", end: "2026-12-27" },
        ]),
        [AIRBNB_B]: ics([{ uid: "x", start: "2026-11-20", end: "2026-11-21" }]),
      },
      { [H1]: [{ slug: "garden", units: 1 }, { slug: "family", units: 2 }] }
    );

    const { summary } = await t.run();
    expect(summary).toMatchObject({ hotels: 2, skippedHotels: 1, feedsOk: 3, feedsFailed: 0, inserted: 4 });
    // Dead sign-up and Aracuya (synced from env) are never fetched.
    expect(t.net.calls.sort()).toEqual([AIRBNB_A, BOOKING, VRBO].sort());

    const rows = t.db.all();
    const byRef = (ref: string) => rows.find((r) => r.external_ref === ref)!;
    expect(byRef("a-1")).toMatchObject({ hotel_id: H1, source: "airbnb", feed_id: a1.id, room_slug: "garden", rooms_count: 1 });
    expect(byRef("b-1")).toMatchObject({ hotel_id: H1, source: "booking_com", feed_id: b1.id, room_slug: "main", rooms_count: 3 });
    expect(byRef("v-1")).toMatchObject({ hotel_id: H2, source: "vrbo", feed_id: v2.id, guest_name: "Ama", rooms_count: 1 });
    expect(rows.filter((r) => r.hotel_id === ARACUYA)).toHaveLength(0);

    expect(t.fs.last(a1.id)).toMatchObject({ ok: true, count: 1 });
    expect(t.fs.last(v2.id)).toMatchObject({ ok: true, count: 2 });
    expect(t.fs.last(dead.id)).toBeUndefined();
  });

  it("a feed tied to a room that was removed counts as the whole property", async () => {
    const f = feed(H1, "airbnb", AIRBNB_A, { room_slug: "gone" });
    const t = setup([{ id: H1, slug: "palm-lodge", hotel: trialing, feeds: [f] }], {
      [AIRBNB_A]: ics([{ uid: "a-1", start: "2026-11-20", end: "2026-11-23" }]),
    }, { [H1]: [{ slug: "garden", units: 1 }, { slug: "family", units: 3 }] });
    await t.run();
    expect(t.db.all()[0]).toMatchObject({ room_slug: "main", rooms_count: 4 });
  });

  it("a hotel with no rooms set up uses its sign-up room count for whole-property blocks", async () => {
    const f = feed(H1, "airbnb", AIRBNB_A);
    const t = setup([{ id: H1, slug: "palm-lodge", hotel: { ...trialing, room_count: 5 }, feeds: [f] }], {
      [AIRBNB_A]: ics([{ uid: "a-1", start: "2026-11-20", end: "2026-11-23" }]),
    });
    await t.run();
    expect(t.db.all()[0].rooms_count).toBe(5);
  });

  it("before the feeds SQL has run: nothing happens and nothing throws", async () => {
    const db = memoryHotelBookings();
    const summary = await syncFeedHotels({
      store: {
        listFeedHotels: async () => {
          throw { code: "PGRST205", message: "Could not find the table 'public.hotel_calendar_feeds'" };
        },
        roomsOf: async () => [],
        recordStatus: async () => {},
      },
      bookings: db.store,
      syncedFeeds: async () => null,
      read: { today: TODAY, listGoogle: null },
      excludeHotelIds: [],
      readDeadline: Date.now() + 1000,
      writeDeadline: Date.now() + 1000,
    });
    expect(summary).toMatchObject({ notSetUp: true, hotels: 0, alertInputs: [] });
  });
});

describe("one bad feed can't stall the others", () => {
  it("timeout, 404, huge file, web page and unreachable host each fail alone with a friendly error; good feeds sync", async () => {
    const good = feed(H1, "airbnb", AIRBNB_A);
    const slow = feed(H1, "booking_com", BOOKING);
    const gone = feed(H2, "vrbo", VRBO);
    const huge = feed(H2, "airbnb", AIRBNB_B);
    const page = feed(H2, "airbnb", "https://www.airbnb.com/rooms/444");
    const down = feed(H2, "airbnb", "https://www.airbnb.com/calendar/ical/555.ics");
    const other = feed(H2, "airbnb", "https://example.com/cal.ics");
    const t = setup(
      [
        { id: H1, slug: "palm-lodge", hotel: trialing, feeds: [good, slow] },
        { id: H2, slug: "volta-view", hotel: trialing, feeds: [gone, huge, page, down, other] },
      ],
      {
        [AIRBNB_A]: ics([{ uid: "a-1", start: "2026-11-20", end: "2026-11-23" }]),
        [BOOKING]: "hang",
        [VRBO]: 404,
        [AIRBNB_B]: "huge",
        "https://www.airbnb.com/rooms/444": "html",
      }
    );
    const started = Date.now();
    const { summary } = await syncFeedHotelsWithCap(t);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(summary).toMatchObject({ feedsOk: 1, feedsFailed: 6, hotels: 1 });
    expect(t.db.all().map((r) => r.external_ref)).toEqual(["a-1"]);
    expect(t.fs.last(good.id)).toMatchObject({ ok: true });
    expect(t.fs.last(slow.id)?.error).toBe("ical.booking.com took too long to answer. We will try again.");
    expect(t.fs.last(gone.id)?.error).toBe("This calendar link no longer works. Copy a fresh link from the booking site.");
    expect(t.fs.last(huge.id)?.error).toBe("The calendar file is too big to be a booking calendar.");
    expect(t.fs.last(page.id)?.error).toBe("This link opens a web page, not a calendar. Copy the export or iCal link instead.");
    expect(t.fs.last(down.id)?.error).toBe("We could not reach www.airbnb.com. Check the link.");
    expect(t.fs.last(other.id)?.error).toBe("This link is not from Airbnb, Booking.com or VRBO.");
    // Tokens never end up in a recorded error.
    for (const [, list] of t.fs.statuses) for (const s of list) expect(s.error ?? "").not.toMatch(/token/);
  });

  it("a failing feed cancels nothing; the same site's other feed in the same hotel still cancels its own removed stays", async () => {
    const a = feed(H1, "airbnb", AIRBNB_A, { room_slug: "garden" });
    const b = feed(H1, "airbnb", AIRBNB_B, { room_slug: "family" });
    const t = setup([{ id: H1, slug: "palm-lodge", hotel: trialing, feeds: [a, b] }], {
      [AIRBNB_A]: ics([{ uid: "a-1", start: "2026-11-20", end: "2026-11-23" }]),
      [AIRBNB_B]: ics([
        { uid: "b-1", start: "2026-11-20", end: "2026-11-23" },
        { uid: "b-2", start: "2026-12-01", end: "2026-12-02" },
      ]),
    }, { [H1]: [{ slug: "garden", units: 1 }, { slug: "family", units: 1 }] });
    await t.run();
    expect(t.db.all()).toHaveLength(3);

    // Feed A now fails, feed B drops b-2.
    t.routes[AIRBNB_A] = 500;
    t.routes[AIRBNB_B] = ics([{ uid: "b-1", start: "2026-11-20", end: "2026-11-23" }]);
    const { summary } = await t.run();
    expect(summary.cancelled).toBe(1);
    const status = Object.fromEntries(t.db.all().map((r) => [r.external_ref, r.booking_status]));
    expect(status).toEqual({ "a-1": "confirmed", "b-1": "confirmed", "b-2": "cancelled" });
    expect(t.fs.last(a.id)).toMatchObject({ ok: false, error: "www.airbnb.com answered with an error (500). We will try again." });
  });

  it("caps work per run: feeds past the cap or the read deadline wait for the next run, oldest first", async () => {
    const old = feed(H1, "airbnb", AIRBNB_A, { last_synced_at: "2026-11-15T10:00:00Z" });
    const never = feed(H1, "vrbo", VRBO);
    const recent = feed(H1, "booking_com", BOOKING, { last_synced_at: "2026-11-15T11:45:00Z" });
    const t = setup([{ id: H1, slug: "palm-lodge", hotel: trialing, feeds: [recent, old, never] }], {
      [AIRBNB_A]: ics([]),
      [VRBO]: ics([]),
      [BOOKING]: ics([]),
    });
    const { summary } = await t.run({ maxFeeds: 2 });
    expect(t.net.calls).toEqual([VRBO, AIRBNB_A]);
    expect(summary).toMatchObject({ feedsOk: 2, feedsNotReached: 1 });

    // Read deadline already passed: nothing is fetched, nothing recorded.
    const t2 = setup([{ id: H1, slug: "palm-lodge", hotel: trialing, feeds: [feed(H1, "airbnb", AIRBNB_A)] }], { [AIRBNB_A]: ics([]) });
    const r2 = await t2.run({ readDeadline: 0 });
    expect(t2.net.calls).toEqual([]);
    expect(r2.summary).toMatchObject({ feedsOk: 0, feedsNotReached: 1 });
  });

  it("limitedMap never runs more than the limit at once", async () => {
    let running = 0;
    let peak = 0;
    await limitedMap([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 3, Number.MAX_SAFE_INTEGER, async () => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
    });
    expect(peak).toBe(3);
  });
});

/** Run with a short per-feed timeout so the hanging feed fails fast. */
function syncFeedHotelsWithCap(t: ReturnType<typeof setup>) {
  return t.run({ icalTimeoutMs: 50 });
}

describe("alerts: first sync of a feed is silent, later bookings alert", () => {
  it("per feed, per hotel; a second feed added later is silent on its first sync too", async () => {
    const a = feed(H1, "airbnb", AIRBNB_A);
    const hotel: FeedHotel = { id: H1, slug: "palm-lodge", hotel: trialing, feeds: [a] };
    const t = setup([hotel, { id: H2, slug: "volta-view", hotel: trialing, feeds: [feed(H2, "vrbo", VRBO)] }], {
      [AIRBNB_A]: ics([
        { uid: "a-1", start: "2026-11-20", end: "2026-11-23" },
        { uid: "a-2", start: "2026-12-05", end: "2026-12-07" },
      ]),
      [VRBO]: ics([{ uid: "v-1", start: "2026-11-25", end: "2026-11-26" }]),
    });

    let r = await t.run();
    expect(r.summary.inserted).toBe(3);
    expect(t.sent).toHaveLength(0);

    // Re-sync: nothing new, nothing sent.
    r = await t.run();
    expect(t.sent).toHaveLength(0);

    // A new booking on an already-synced feed: one email, to that hotel.
    t.routes[AIRBNB_A] = ics([
      { uid: "a-1", start: "2026-11-20", end: "2026-11-23" },
      { uid: "a-2", start: "2026-12-05", end: "2026-12-07" },
      { uid: "a-3", start: "2026-12-10", end: "2026-12-12" },
    ]);
    await t.run();
    expect(t.sent.map((m) => m.to)).toEqual(["palm-lodge@example.com"]);
    expect(t.sent[0].subject).toMatch(/^New booking: /);

    // The hotel adds a second Airbnb listing: its history comes in without emails.
    hotel.feeds.push(feed(H1, "airbnb", AIRBNB_B));
    t.routes[AIRBNB_B] = ics([
      { uid: "b-1", start: "2026-11-28", end: "2026-11-30" },
      { uid: "b-2", start: "2027-01-02", end: "2027-01-05" },
    ]);
    await t.run();
    expect(t.sent).toHaveLength(1);

    // A booking removed from a synced feed: one cancellation email.
    t.routes[AIRBNB_B] = ics([{ uid: "b-1", start: "2026-11-28", end: "2026-11-30" }]);
    await t.run();
    expect(t.sent).toHaveLength(2);
    expect(t.sent[1].subject).toMatch(/^Cancelled: /);
  });

  it("a feed that fails on its first try stays unsynced, so its first good load is still silent", async () => {
    const a = feed(H1, "airbnb", AIRBNB_A);
    const t = setup([{ id: H1, slug: "palm-lodge", hotel: trialing, feeds: [a] }], { [AIRBNB_A]: 503 });
    await t.run();
    t.routes[AIRBNB_A] = ics([{ uid: "a-1", start: "2026-11-20", end: "2026-11-23" }]);
    await t.run();
    expect(t.db.all()).toHaveLength(1);
    expect(t.sent).toHaveLength(0);
  });
});

describe("Aracuya unchanged", () => {
  it("env feeds (no feed id) insert exactly the same rows as before: suite, no feed_id key, source-level cancel", async () => {
    const db = memoryHotelBookings();
    const icsText = ics([
      { uid: "x-1", start: "2026-11-20", end: "2026-11-23" },
      { uid: "x-2", start: "2026-12-01", end: "2026-12-02" },
    ]);
    const { parseIcalBookings } = await import("./calendar-sync");
    const feeds: FeedResult[] = [
      { source: "airbnb", bookings: parseIcalBookings(icsText, "airbnb", 3) },
      { source: "google_calendar", bookings: [googleEventToBooking({ id: "g1", summary: "2 Rooms - Kofi", start: { date: "2026-11-25" }, end: { date: "2026-11-27" } }, 3)!] },
    ];
    await syncHotelBookings({ store: db.store, hotelId: ARACUYA, hotelSlug: "aracuya", feeds, today: TODAY });
    const rows = db.all();
    expect(rows).toHaveLength(3);
    for (const r of rows) {
      expect(r.room_slug).toBe("suite");
      expect("feed_id" in r).toBe(false);
    }
    expect(rows.find((r) => r.external_ref === "g1")?.rooms_count).toBe(2);
    expect(rows.find((r) => r.external_ref === "x-1")?.rooms_count).toBe(3);

    // Source-level rule as before: x-2 gone from a loaded airbnb feed → cancelled.
    await syncHotelBookings({
      store: db.store,
      hotelId: ARACUYA,
      hotelSlug: "aracuya",
      feeds: [{ source: "airbnb", bookings: parseIcalBookings(ics([{ uid: "x-1", start: "2026-11-20", end: "2026-11-23" }]), "airbnb", 3) }],
      today: TODAY,
    });
    expect(db.all().find((r) => r.external_ref === "x-2")?.booking_status).toBe("cancelled");
    expect(db.all().find((r) => r.external_ref === "g1")?.booking_status).toBe("confirmed");
  });

  it("the multi-hotel sync never touches Aracuya, even if it had feed rows", async () => {
    const t = setup([{ id: ARACUYA, slug: "aracuya", hotel: { billing_exempt: true }, feeds: [feed(ARACUYA, "airbnb", AIRBNB_A)] }], {
      [AIRBNB_A]: ics([{ uid: "a-1", start: "2026-11-20", end: "2026-11-23" }]),
    });
    const { summary } = await t.run();
    expect(t.net.calls).toEqual([]);
    expect(summary).toMatchObject({ hotels: 0, alertInputs: [] });
  });
});

describe("validating a link on save", () => {
  const base = { rooms: ["garden"], existing: [] as Pick<HotelFeed, "id" | "url">[], listGoogle: null, today: TODAY };

  it("accepts a working Airbnb link (webcal too) and reads it once", async () => {
    const net = mockFetch({ [AIRBNB_A]: ics([]) });
    const r = await validateFeedInput({ type: "ical", value: ` ${AIRBNB_A.replace("https://", "webcal://")} `, room: "garden" }, { ...base, fetchImpl: net.fn });
    expect(r).toEqual({ ok: true, value: { kind: "airbnb", url: AIRBNB_A, room_slug: "garden" } });
    expect(net.calls).toEqual([AIRBNB_A]);
  });

  it.each([
    [{ type: "ical", value: "" }, "Paste the calendar link first."],
    [{ type: "ical", value: "not a link" }, "That is not a web address. Copy the full link that starts with https."],
    [{ type: "ical", value: "http://www.airbnb.com/calendar/ical/1.ics" }, "The link must start with https."],
    [{ type: "ical", value: "https://calendar.example.com/x.ics" }, "We can read calendar links from Airbnb, Booking.com and VRBO. This link is from somewhere else."],
    [{ type: "ical", value: AIRBNB_A, room: "penthouse" }, "Pick a room from the list."],
    [{ type: "google", value: "my calendar" }, "The calendar ID looks like an email address, for example abc123@group.calendar.google.com."],
    [{ type: "nope", value: AIRBNB_A }, "Choose a booking site link or a Google calendar."],
  ])("refuses %j without fetching", async (body, error) => {
    const net = mockFetch({});
    expect(await validateFeedInput(body as Record<string, unknown>, { ...base, fetchImpl: net.fn })).toEqual({ ok: false, error });
    expect(net.calls).toEqual([]);
  });

  it("friendly errors for a link that doesn't work", async () => {
    const net = mockFetch({ [AIRBNB_A]: 404, [VRBO]: "html", [BOOKING]: 403 });
    const check = (value: string) => validateFeedInput({ type: "ical", value }, { ...base, fetchImpl: net.fn });
    expect(await check(AIRBNB_A)).toEqual({ ok: false, error: "This calendar link no longer works. Copy a fresh link from the booking site." });
    expect(await check(VRBO)).toEqual({ ok: false, error: "This link opens a web page, not a calendar. Copy the export or iCal link instead." });
    expect(await check(BOOKING)).toEqual({ ok: false, error: "The booking site refused this link. Copy a fresh link from the booking site." });
  });

  it("refuses a duplicate, but not the feed being edited", async () => {
    const net = mockFetch({ [AIRBNB_A]: ics([]) });
    const existing = [{ id: "f1", url: AIRBNB_A }];
    expect(await validateFeedInput({ type: "ical", value: AIRBNB_A }, { ...base, existing, fetchImpl: net.fn })).toEqual({
      ok: false,
      error: "You have added this calendar already.",
    });
    expect((await validateFeedInput({ type: "ical", value: AIRBNB_A }, { ...base, existing, editingId: "f1", fetchImpl: net.fn })).ok).toBe(true);
  });

  it("does not follow a redirect to another website", async () => {
    const fetchImpl = vi.fn(async () => {
      const res = new Response(ics([]), { status: 200 });
      Object.defineProperty(res, "url", { value: "https://evil.example.com/x" });
      return res;
    });
    expect(await validateFeedInput({ type: "ical", value: AIRBNB_A }, { ...base, fetchImpl })).toEqual({
      ok: false,
      error: "The link sent us to another website. Copy the calendar link again.",
    });
  });

  it("Google: checks the calendar is shared; explains how when it isn't", async () => {
    const shared = vi.fn(async () => []);
    expect(await validateFeedInput({ type: "google", value: "abc@group.calendar.google.com" }, { ...base, listGoogle: shared })).toEqual({
      ok: true,
      value: { kind: "google_calendar", url: "abc@group.calendar.google.com", room_slug: null },
    });
    const notShared = vi.fn(async () => {
      throw Object.assign(new Error("Not Found"), { code: 404 });
    });
    expect(await validateFeedInput({ type: "google", value: "abc@group.calendar.google.com" }, { ...base, listGoogle: notShared })).toEqual({
      ok: false,
      error: "We can't read this calendar yet. Share it with Abeiku first (see the steps above), then try again.",
    });
    expect(await validateFeedInput({ type: "google", value: "abc@group.calendar.google.com" }, base)).toEqual({
      ok: false,
      error: "Google calendars can't be connected yet. Please try again later.",
    });
  });
});

describe("sign-up links", () => {
  it("become whole-property feeds of the right kind", () => {
    expect(signupLinksToFeeds({ airbnb: AIRBNB_A, booking: BOOKING, vrbo: null, google: "abc@group.calendar.google.com" })).toEqual([
      { kind: "airbnb", url: AIRBNB_A },
      { kind: "booking_com", url: BOOKING },
      { kind: "google_calendar", url: "abc@group.calendar.google.com" },
    ]);
    expect(signupLinksToFeeds(null)).toEqual([]);
  });
});
