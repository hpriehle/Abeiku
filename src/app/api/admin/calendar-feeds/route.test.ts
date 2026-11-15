import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let hotel: Record<string, unknown> = { id: "h1", slug: "palm-lodge" };
let feeds: Record<string, unknown>[] = [];
let missingTable = false;
const insertHotelFeed = vi.fn();

vi.mock("@/lib/admin/auth", () => ({ getSession: async () => ({ hotelId: "h1" }) }));
vi.mock("@/lib/db", () => ({
  getHotelById: async () => hotel,
  getHotelRooms: async () => [{ slug: "garden", name: "Garden room" }],
}));
vi.mock("@/lib/db/hotel-feeds", async (orig) => {
  const real = await orig<typeof import("@/lib/db/hotel-feeds")>();
  return {
    isMissingSchema: real.isMissingSchema,
    listHotelFeeds: async () => {
      if (missingTable) throw { code: "PGRST205", message: "Could not find the table 'public.hotel_calendar_feeds'" };
      return feeds;
    },
    insertHotelFeed: (...a: unknown[]) => insertHotelFeed(...a),
  };
});
vi.mock("@/lib/bookings/google-lister", () => ({ googleListerFromEnv: () => null, serviceAccountEmail: () => "sync@abeiku.iam.gserviceaccount.com" }));

const { GET, POST } = await import("./route");

const post = (body: unknown) =>
  POST(new NextRequest("http://localhost/api/admin/calendar-feeds", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

beforeEach(() => {
  hotel = { id: "h1", slug: "palm-lodge" };
  feeds = [];
  missingTable = false;
  insertHotelFeed.mockReset();
  vi.unstubAllGlobals();
});

describe("/api/admin/calendar-feeds", () => {
  it("lists feeds with status and no full link (it holds a token)", async () => {
    feeds = [
      {
        id: "f1",
        hotel_id: "h1",
        kind: "airbnb",
        url: "https://www.airbnb.com/calendar/ical/123.ics?s=secrettoken",
        room_slug: "garden",
        last_synced_at: "2026-11-15T11:45:00Z",
        last_count: 4,
        last_error: null,
        last_error_at: null,
      },
    ];
    const res = await GET();
    const body = await res.json();
    expect(body.shareWith).toBe("sync@abeiku.iam.gserviceaccount.com");
    expect(body.feeds[0]).toMatchObject({ label: "Airbnb", roomName: "Garden room", lastCount: 4, lastSyncedAt: "2026-11-15T11:45:00Z" });
    expect(JSON.stringify(body)).not.toContain("secrettoken");
  });

  it("before the SQL: the list says not set up, adding gives a friendly 503 (never a 500)", async () => {
    missingTable = true;
    expect(await (await GET()).json()).toMatchObject({ notSetUp: true, feeds: [] });
    const res = await post({ type: "ical", value: "https://www.airbnb.com/calendar/ical/1.ics" });
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("Calendar links can't be changed yet. Please try again later.");
  });

  it("Aracuya: read-only (its feeds are set in env)", async () => {
    hotel = { id: "a", slug: "aracuya" };
    expect(await (await GET()).json()).toMatchObject({ managed: true, feeds: [] });
    const res = await post({ type: "ical", value: "https://www.airbnb.com/calendar/ical/1.ics" });
    expect(res.status).toBe(409);
    expect(insertHotelFeed).not.toHaveBeenCalled();
  });

  it("adds a link after one successful read; a bad link is refused with its reason", async () => {
    const url = "https://www.airbnb.com/calendar/ical/1.ics";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("BEGIN:VCALENDAR\r\nEND:VCALENDAR", { status: 200 })));
    insertHotelFeed.mockImplementation(async (row: Record<string, unknown>) => ({ id: "f9", last_synced_at: null, last_count: null, last_error: null, last_error_at: null, ...row }));
    const ok = await post({ type: "ical", value: url, room: "all" });
    expect(ok.status).toBe(200);
    expect(insertHotelFeed).toHaveBeenCalledWith({ hotel_id: "h1", kind: "airbnb", url, room_slug: null });

    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>", { status: 200 })));
    const bad = await post({ type: "ical", value: "https://www.airbnb.com/calendar/ical/2.ics" });
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toBe("This link opens a web page, not a calendar. Copy the export or iCal link instead.");
  });
});
