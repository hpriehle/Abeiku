import { describe, expect, it } from "vitest";
import {
  addDays,
  assignLanes,
  groupStays,
  movements,
  nightsBetween,
  roomsBookedOn,
  sourceOf,
  stayPaymentStatus,
  stayTotal,
  type CalendarBookingRow,
} from "./calendar-view";

let n = 0;
function row(p: Partial<CalendarBookingRow> & Pick<CalendarBookingRow, "check_in" | "check_out">): CalendarBookingRow {
  n += 1;
  return {
    id: `b${String(n).padStart(3, "0")}`,
    source: "google_calendar",
    guest_name: "Ama Mensah",
    phone: null,
    room_slug: "suite",
    rooms_count: 1,
    total_price: 0,
    currency: "USD",
    payment_status: "unpaid",
    booking_status: "confirmed",
    ...p,
  };
}

describe("sourceOf", () => {
  it("maps every stored source to its badge", () => {
    expect(sourceOf({ source: "aracuya_web", payment_provider: "stripe" }).label).toBe("Website");
    expect(sourceOf({ source: "aracuya_web", payment_provider: null }).label).toBe("Website");
    expect(sourceOf({ source: "aracuya_web", payment_provider: "momo" }).label).toBe("MoMo");
    expect(sourceOf({ source: "google_calendar" }).label).toBe("Google calendar");
    expect(sourceOf({ source: "airbnb" }).label).toBe("Airbnb");
    expect(sourceOf({ source: "vrbo" }).label).toBe("VRBO");
    expect(sourceOf({ source: "booking_com" }).label).toBe("Booking.com");
    expect(sourceOf({ source: "whatsapp" }).label).toBe("WhatsApp");
    expect(sourceOf({ source: "manual" }).label).toBe("Manual");
  });

  it("treats rows from before sources existed (NULL or no column yet) as WhatsApp, editable", () => {
    expect(sourceOf({ source: null }).kind).toBe("whatsapp");
    expect(sourceOf({}).kind).toBe("whatsapp");
    expect(sourceOf({}).imported).toBe(false);
  });

  it("marks only imported sources read-only, with where to edit them", () => {
    for (const s of ["aracuya_web", "google_calendar", "airbnb", "vrbo", "booking_com"] as const) {
      const info = sourceOf({ source: s });
      expect(info.imported).toBe(true);
      expect(info.editIn).toBeTruthy();
    }
    expect(sourceOf({ source: "manual" }).imported).toBe(false);
  });

  it("gives each badge its own colour", () => {
    const colors = ["aracuya_web", "google_calendar", "airbnb", "vrbo", "booking_com", "whatsapp", "manual"].map(
      (s) => sourceOf({ source: s as CalendarBookingRow["source"] }).color
    );
    colors.push(sourceOf({ source: "aracuya_web", payment_provider: "momo" }).color);
    expect(new Set(colors).size).toBe(8);
  });
});

describe("dates", () => {
  it("adds days across month and year ends", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2027-03-01", -1)).toBe("2027-02-28");
    expect(nightsBetween("2026-11-28", "2026-12-02")).toBe(4);
  });
});

describe("groupStays", () => {
  it("joins back-to-back one-night rows of the same guest and source into one stay", () => {
    const rows = [
      row({ check_in: "2026-11-21", check_out: "2026-11-22", total_price: 100 }),
      row({ check_in: "2026-11-20", check_out: "2026-11-21", total_price: 100 }),
      row({ check_in: "2026-11-22", check_out: "2026-11-23", total_price: 100 }),
    ];
    const stays = groupStays(rows);
    expect(stays).toHaveLength(1);
    expect(stays[0]).toMatchObject({ check_in: "2026-11-20", check_out: "2026-11-23", nights: 3 });
    expect(stays[0].rows).toHaveLength(3);
    expect(stayTotal(stays[0])).toBe(300);
  });

  it("does not change the rows it is given", () => {
    const rows = [row({ check_in: "2026-11-20", check_out: "2026-11-21" }), row({ check_in: "2026-11-21", check_out: "2026-11-22" })];
    const copy = JSON.parse(JSON.stringify(rows));
    groupStays(rows);
    expect(rows).toEqual(copy);
  });

  it("matches the guest name ignoring case and extra spaces", () => {
    const stays = groupStays([
      row({ guest_name: "Ama  Mensah", check_in: "2026-11-20", check_out: "2026-11-21" }),
      row({ guest_name: "ama mensah ", check_in: "2026-11-21", check_out: "2026-11-22" }),
    ]);
    expect(stays).toHaveLength(1);
  });

  it("keeps different guests, sources, room counts, gaps and cancelled rows apart", () => {
    const base = { check_in: "2026-11-20", check_out: "2026-11-21" };
    const next = { check_in: "2026-11-21", check_out: "2026-11-22" };
    expect(groupStays([row(base), row({ ...next, guest_name: "Kofi" })])).toHaveLength(2);
    expect(groupStays([row(base), row({ ...next, source: "airbnb" })])).toHaveLength(2);
    expect(groupStays([row(base), row({ ...next, rooms_count: 2 })])).toHaveLength(2);
    expect(groupStays([row(base), row({ ...next, booking_status: "cancelled" })])).toHaveLength(2);
    expect(groupStays([row(base), row({ check_in: "2026-11-22", check_out: "2026-11-23" })])).toHaveLength(2);
  });

  it("never joins a multi-night row", () => {
    const stays = groupStays([
      row({ source: "aracuya_web", check_in: "2026-11-20", check_out: "2026-11-23" }),
      row({ source: "aracuya_web", check_in: "2026-11-23", check_out: "2026-11-24" }),
    ]);
    expect(stays).toHaveLength(2);
  });

  it("groups each of two guests' interleaved nights separately", () => {
    const stays = groupStays([
      row({ guest_name: "A", check_in: "2026-11-20", check_out: "2026-11-21" }),
      row({ guest_name: "B", check_in: "2026-11-20", check_out: "2026-11-21" }),
      row({ guest_name: "A", check_in: "2026-11-21", check_out: "2026-11-22" }),
      row({ guest_name: "B", check_in: "2026-11-21", check_out: "2026-11-22" }),
    ]);
    expect(stays.map((s) => [s.guest_name, s.nights])).toEqual([
      ["A", 2],
      ["B", 2],
    ]);
  });

  it("reports mixed payment as partly paid", () => {
    const [stay] = groupStays([
      row({ check_in: "2026-11-20", check_out: "2026-11-21", payment_status: "paid" }),
      row({ check_in: "2026-11-21", check_out: "2026-11-22", payment_status: "unpaid" }),
    ]);
    expect(stayPaymentStatus(stay)).toBe("partly paid");
  });
});

describe("occupancy and lanes", () => {
  const stays = groupStays([
    row({ guest_name: "A", rooms_count: 2, check_in: "2026-11-20", check_out: "2026-11-23", source: "airbnb" }),
    row({ guest_name: "B", rooms_count: 1, check_in: "2026-11-21", check_out: "2026-11-22" }),
    row({ guest_name: "C", rooms_count: 3, check_in: "2026-11-23", check_out: "2026-11-24", booking_status: "cancelled" }),
  ]);

  it("counts rooms per night, checkout day not included, cancelled left out", () => {
    expect(roomsBookedOn(stays, "2026-11-20")).toBe(2);
    expect(roomsBookedOn(stays, "2026-11-21")).toBe(3);
    expect(roomsBookedOn(stays, "2026-11-23")).toBe(0);
  });

  it("puts a 2-room stay in two lanes and fits within 3 rooms", () => {
    const { segments, laneCount } = assignLanes(stays, 3);
    expect(laneCount).toBe(3);
    expect(segments.filter((s) => s.stay.guest_name === "A").map((s) => s.lane)).toEqual([0, 1]);
    expect(segments.find((s) => s.stay.guest_name === "B")?.lane).toBe(2);
    expect(segments.some((s) => s.stay.guest_name === "C")).toBe(false);
  });

  it("adds an extra lane when overbooked", () => {
    const over = groupStays([
      row({ guest_name: "A", rooms_count: 3, check_in: "2026-11-20", check_out: "2026-11-22", source: "vrbo" }),
      row({ guest_name: "B", rooms_count: 1, check_in: "2026-11-21", check_out: "2026-11-22" }),
    ]);
    expect(assignLanes(over, 3).laneCount).toBe(4);
  });
});

describe("movements", () => {
  it("lists arrivals and departures today, tomorrow and later this week", () => {
    const stays = groupStays([
      row({ guest_name: "Today", check_in: "2026-11-15", check_out: "2026-11-17", source: "airbnb" }),
      row({ guest_name: "Tomorrow", check_in: "2026-11-16", check_out: "2026-11-18", source: "vrbo" }),
      row({ guest_name: "Week", check_in: "2026-11-21", check_out: "2026-11-25", source: "manual" }),
      row({ guest_name: "Later", check_in: "2026-11-22", check_out: "2026-11-23", source: "manual" }),
      row({ guest_name: "Gone", check_in: "2026-11-15", check_out: "2026-11-16", source: "whatsapp", booking_status: "cancelled" }),
      row({ guest_name: "Leaving", check_in: "2026-11-12", check_out: "2026-11-15", source: "booking_com" }),
    ]);
    const m = movements(stays, "2026-11-15");
    expect(m.arrivals.today.map((s) => s.guest_name)).toEqual(["Today"]);
    expect(m.arrivals.tomorrow.map((s) => s.guest_name)).toEqual(["Tomorrow"]);
    expect(m.arrivals.week.map((s) => s.guest_name)).toEqual(["Week"]);
    expect(m.departures.today.map((s) => s.guest_name)).toEqual(["Leaving"]);
    expect(m.departures.tomorrow).toEqual([]);
    expect(m.departures.week.map((s) => s.guest_name)).toEqual(["Today", "Tomorrow"]);
  });
});

describe("OTA calendar blocks", () => {
  const base: CalendarBookingRow = {
    id: "b1",
    source: "airbnb",
    guest_name: "Airbnb · Airbnb (Not available)",
    phone: null,
    room_slug: "aracuya",
    rooms_count: 3,
    check_in: "2026-11-19",
    check_out: "2026-11-20",
    total_price: 0,
    currency: "GHS",
    payment_status: "unpaid",
    booking_status: "confirmed",
  };

  it("a block is labelled as a block, still takes the rooms, and is not an arrival", () => {
    const stays = groupStays([base, { ...base, id: "b2", source: "airbnb", guest_name: "Airbnb · Reserved" }]);
    const block = stays.find((s) => s.id === "b1")!;
    const booking = stays.find((s) => s.id === "b2")!;
    expect(block).toMatchObject({ block: true, guest_name: "Blocked · Airbnb" });
    expect(booking).toMatchObject({ block: false, guest_name: "Airbnb · Reserved" });
    expect(roomsBookedOn(stays, "2026-11-19")).toBe(6);
    const mv = movements(stays, "2026-11-18");
    expect(mv.arrivals.tomorrow.map((s) => s.id)).toEqual(["b2"]);
    expect(mv.departures.week.map((s) => s.id)).toEqual(["b2"]);
  });
});
