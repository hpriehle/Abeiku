// The cron route: Aracuya's env sync is called exactly as before, other hotels run next to
// it, and the feeds table being missing changes nothing for Aracuya.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { FeedSyncSummary } from "@/lib/bookings/feed-sync";

const ARACUYA = "75218f6b-a953-4b74-b5c8-abd040af21f1";

const readFeeds = vi.fn();
const syncHotelBookings = vi.fn();
const syncFeedHotels = vi.fn();
const alertsAfterSync = vi.fn();
const alertsAfterSyncs = vi.fn();
const syncedFeedsBefore = vi.fn();

vi.mock("@/lib/db/influencers", () => ({ supabaseBookingReportStore: { findHotelId: async () => ARACUYA } }));
vi.mock("@/lib/db/hotel-bookings", () => ({ supabaseHotelBookingsStore: { name: "bookings-store" } }));
vi.mock("@/lib/db/hotel-feeds", () => ({ supabaseFeedSyncStore: { name: "feeds-store" } }));
vi.mock("@/lib/bookings/google-lister", () => ({ googleListerFromEnv: () => null }));
vi.mock("@/lib/bookings/calendar-sync", () => ({ syncHotelBookings: (...a: unknown[]) => syncHotelBookings(...a) }));
vi.mock("@/lib/bookings/feed-sync", () => ({ syncFeedHotels: (...a: unknown[]) => syncFeedHotels(...a) }));
vi.mock("@/lib/alerts", () => ({
  alertsAfterSync: (...a: unknown[]) => alertsAfterSync(...a),
  alertsAfterSyncs: (...a: unknown[]) => alertsAfterSyncs(...a),
  syncedFeedsBefore: (...a: unknown[]) => syncedFeedsBefore(...a),
}));
vi.mock("@/lib/bookings/feeds", async (orig) => ({
  ...(await orig<typeof import("@/lib/bookings/feeds")>()),
  readFeeds: (...a: unknown[]) => readFeeds(...a),
}));

const { POST } = await import("./route");

const call = () =>
  POST(new NextRequest("http://localhost/api/cron/booking-sync", { method: "POST", headers: { authorization: "Bearer s3cret" } }));

const emptyOthers = (over: Partial<FeedSyncSummary> = {}): FeedSyncSummary => ({
  hotels: 0,
  skippedHotels: 0,
  feedsOk: 0,
  feedsFailed: 0,
  feedsNotReached: 0,
  inserted: 0,
  updated: 0,
  cancelled: 0,
  failedHotels: [],
  alertInputs: [],
  ...over,
});

const aracuyaSummary = { inserted: 2, updated: 0, cancelled: 0, unchanged: 5, matchedWeb: 1, failedFeeds: [] };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "s3cret";
  process.env.BLOCKING_ICAL_URLS = "https://www.airbnb.com/calendar/ical/1.ics?s=t";
  syncedFeedsBefore.mockResolvedValue(new Set(["google_calendar"]));
  readFeeds.mockResolvedValue({ feeds: [{ source: "airbnb", bookings: [] }], errors: ["google_calendar: not configured"] });
  syncHotelBookings.mockResolvedValue(aracuyaSummary);
  alertsAfterSync.mockResolvedValue({ silencedBackfill: 0, newSent: 0 });
  alertsAfterSyncs.mockResolvedValue({ silencedBackfill: 3, newSent: 1 });
});

describe("POST /api/cron/booking-sync", () => {
  it("refuses without the secret", async () => {
    const res = await POST(new NextRequest("http://localhost/api/cron/booking-sync", { method: "POST" }));
    expect(res.status).toBe(401);
    expect(readFeeds).not.toHaveBeenCalled();
    expect(syncFeedHotels).not.toHaveBeenCalled();
  });

  it("Aracuya: env feeds, 3 rooms, same sync call, same alert call, same response fields (feeds table missing)", async () => {
    syncFeedHotels.mockResolvedValue(emptyOthers({ notSetUp: true }));
    const res = await call();
    expect(res.status).toBe(200);

    const [cfg, totalRooms] = readFeeds.mock.calls[0];
    expect(cfg.icalUrls).toEqual(["https://www.airbnb.com/calendar/ical/1.ics?s=t"]);
    expect(totalRooms).toBe(3);
    expect(syncHotelBookings).toHaveBeenCalledWith(expect.objectContaining({ hotelId: ARACUYA, hotelSlug: "aracuya" }));
    expect(alertsAfterSync).toHaveBeenCalledWith({ hotelId: ARACUYA, loadedFeeds: ["airbnb"], syncedBefore: new Set(["google_calendar"]) });
    expect(alertsAfterSyncs).not.toHaveBeenCalled();
    // Aracuya is excluded from the per-hotel sync.
    expect(syncFeedHotels.mock.calls[0][0].excludeHotelIds).toEqual([ARACUYA]);

    const body = await res.json();
    expect(body).toMatchObject({ ok: true, hotel: "aracuya", ...aracuyaSummary, errors: ["google_calendar: not configured"], alerts: { silencedBackfill: 0 } });
    expect(body.otherHotels).toEqual({ notSetUp: true });
  });

  it("other hotels synced: each backfill is handled, one sweep, counts only in the response", async () => {
    const other = { hotelId: "h1", loadedFeeds: ["feed:f1"], syncedBefore: new Set<string>() };
    syncFeedHotels.mockResolvedValue(emptyOthers({ hotels: 1, feedsOk: 1, inserted: 4, alertInputs: [other] }));
    const res = await call();
    const body = await res.json();
    expect(alertsAfterSync).not.toHaveBeenCalled();
    expect(alertsAfterSyncs).toHaveBeenCalledWith([
      { hotelId: ARACUYA, loadedFeeds: ["airbnb"], syncedBefore: new Set(["google_calendar"]) },
      other,
    ]);
    expect(body.otherHotels).toMatchObject({ hotels: 1, feedsOk: 1, inserted: 4 });
    expect(body.otherHotels.alertInputs).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("feed:f1");
  });

  it("a crash in the other-hotels sync never fails Aracuya's", async () => {
    syncFeedHotels.mockRejectedValue(new Error("boom"));
    const res = await call();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, inserted: 2, otherHotels: { error: "failed" } });
    expect(alertsAfterSync).toHaveBeenCalled();
  });
});
