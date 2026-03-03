"use client";

import { useState } from "react";

interface CalendarBooking {
  id: string;
  guest_name: string;
  room_slug: string;
  check_in: string;
  check_out: string;
  booking_status: string;
  rooms_count: number;
}

interface CalendarRoom {
  id: string;
  slug: string;
  name: string;
  room_type: string;
  group_id: string | null;
  total_rooms: number;
}

interface Props {
  initialBookings: CalendarBooking[];
  initialRooms: CalendarRoom[];
  initialBlockedDates: string[];
  initialYear: number;
  initialMonth: number;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const BOOKING_COLORS = [
  { bg: "bg-emerald-200", text: "text-emerald-900" },
  { bg: "bg-blue-200", text: "text-blue-900" },
  { bg: "bg-amber-200", text: "text-amber-900" },
  { bg: "bg-purple-200", text: "text-purple-900" },
  { bg: "bg-rose-200", text: "text-rose-900" },
  { bg: "bg-cyan-200", text: "text-cyan-900" },
];

function toDateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

type CellState =
  | { type: "available" }
  | { type: "booked"; booking: CalendarBooking; colorIdx: number }
  | { type: "blocked"; reason: string };

export function RoomAvailabilityGrid({
  initialBookings,
  initialRooms,
  initialBlockedDates,
  initialYear,
  initialMonth,
}: Props) {
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [bookings, setBookings] = useState(initialBookings);
  const [rooms, setRooms] = useState(initialRooms);
  const [blockedDates, setBlockedDates] = useState(new Set(initialBlockedDates));
  const [loading, setLoading] = useState(false);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    roomName: string;
    dateStr: string;
    state: CellState;
  } | null>(null);

  const daysInMonth = new Date(year, month, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const todayStr = (() => {
    const now = new Date();
    return toDateStr(now.getFullYear(), now.getMonth() + 1, now.getDate());
  })();

  // Assign consistent color per booking
  const bookingColorMap = new Map<string, number>();
  bookings.forEach((b, i) => {
    bookingColorMap.set(b.id, i % BOOKING_COLORS.length);
  });

  // Build lookup: room_slug → bookings overlapping each day
  function getBookingForRoomOnDay(roomSlug: string, dateStr: string): CalendarBooking | null {
    return bookings.find(
      (b) => b.room_slug === roomSlug && b.check_in <= dateStr && b.check_out > dateStr
    ) ?? null;
  }

  // Compute cell state considering group/individual blocking
  function getCellState(room: CalendarRoom, dateStr: string): CellState {
    // Direct booking on this room
    const directBooking = getBookingForRoomOnDay(room.slug, dateStr);
    if (directBooking) {
      return {
        type: "booked",
        booking: directBooking,
        colorIdx: bookingColorMap.get(directBooking.id) ?? 0,
      };
    }

    // Group room: blocked if any member room is booked
    if (room.room_type === "group") {
      const members = rooms.filter((r) => r.group_id === room.id);
      for (const member of members) {
        const memberBooking = getBookingForRoomOnDay(member.slug, dateStr);
        if (memberBooking) {
          return { type: "blocked", reason: `${member.name} is booked` };
        }
      }
    }

    // Individual room: blocked if parent group is booked
    if (room.room_type === "individual" && room.group_id) {
      const parent = rooms.find((r) => r.id === room.group_id);
      if (parent) {
        const parentBooking = getBookingForRoomOnDay(parent.slug, dateStr);
        if (parentBooking) {
          return { type: "blocked", reason: `${parent.name} is booked` };
        }
      }
    }

    // External calendar block
    if (blockedDates.has(dateStr)) {
      return { type: "blocked", reason: "Blocked (external)" };
    }

    return { type: "available" };
  }

  async function fetchMonth(y: number, m: number) {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/bookings/calendar?year=${y}&month=${m}`);
      if (res.ok) {
        const data = await res.json();
        setBookings(data.bookings);
        setBlockedDates(new Set(data.blockedDates ?? []));
        if (data.rooms) setRooms(data.rooms);
      }
    } finally {
      setLoading(false);
    }
  }

  function goToPrev() {
    const newMonth = month === 1 ? 12 : month - 1;
    const newYear = month === 1 ? year - 1 : year;
    setMonth(newMonth);
    setYear(newYear);
    fetchMonth(newYear, newMonth);
  }

  function goToNext() {
    const newMonth = month === 12 ? 1 : month + 1;
    const newYear = month === 12 ? year + 1 : year;
    setMonth(newMonth);
    setYear(newYear);
    fetchMonth(newYear, newMonth);
  }

  function goToToday() {
    const now = new Date();
    const todayYear = now.getFullYear();
    const todayMonth = now.getMonth() + 1;
    if (todayYear !== year || todayMonth !== month) {
      setYear(todayYear);
      setMonth(todayMonth);
      fetchMonth(todayYear, todayMonth);
    }
  }

  function handleCellClick(
    e: React.MouseEvent,
    room: CalendarRoom,
    dateStr: string,
    state: CellState
  ) {
    if (state.type === "available") {
      setTooltip(null);
      return;
    }
    if (tooltip?.dateStr === dateStr && tooltip?.roomName === room.name) {
      setTooltip(null);
      return;
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setTooltip({
      x: rect.left + rect.width / 2,
      y: rect.bottom + 4,
      roomName: room.name,
      dateStr,
      state,
    });
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr + "T00:00:00").toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
    });
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 relative">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Room Availability</h3>
        <div className="flex items-center gap-3">
          <button
            onClick={goToToday}
            className="px-3 py-1 text-xs font-medium text-[#2D4A3E] border border-[#2D4A3E] rounded-lg hover:bg-[#2D4A3E] hover:text-white transition-colors"
          >
            Today
          </button>
          <div className="flex items-center gap-1">
            <button
              onClick={goToPrev}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="text-sm font-medium text-gray-900 w-36 text-center">
              {MONTH_NAMES[month - 1]} {year}
            </span>
            <button
              onClick={goToNext}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mb-4 pb-3 border-b border-gray-100">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-emerald-50 border border-emerald-200" />
          <span className="text-xs text-gray-500">Available</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-emerald-200" />
          <span className="text-xs text-gray-500">Booked</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-gray-200" />
          <span className="text-xs text-gray-500">Blocked</span>
        </div>
      </div>

      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 bg-white/60 rounded-xl z-10 flex items-center justify-center">
          <span className="text-sm text-gray-500">Loading...</span>
        </div>
      )}

      {/* Grid */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse min-w-[800px]">
          <thead>
            <tr>
              <th className="sticky left-0 bg-white z-[5] text-left text-xs font-medium text-gray-400 uppercase tracking-wider py-2 px-3 w-36 min-w-[144px]">
                Room
              </th>
              {days.map((day) => {
                const dateStr = toDateStr(year, month, day);
                const isToday = dateStr === todayStr;
                const dow = new Date(year, month - 1, day).getDay();
                const isWeekend = dow === 0 || dow === 6;
                return (
                  <th
                    key={day}
                    className={`text-center text-[10px] font-medium py-2 px-0 w-9 min-w-[36px] ${
                      isToday
                        ? "text-white"
                        : isWeekend
                        ? "text-gray-400"
                        : "text-gray-500"
                    }`}
                  >
                    <div
                      className={`mx-auto w-6 h-6 flex items-center justify-center rounded-full ${
                        isToday ? "bg-[#2D4A3E]" : ""
                      }`}
                    >
                      {day}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rooms.map((room) => (
              <tr key={room.id} className="border-t border-gray-50">
                <td className="sticky left-0 bg-white z-[5] py-2 px-3 text-sm font-medium text-gray-900 whitespace-nowrap">
                  <div className="flex items-center gap-1.5">
                    {room.name}
                    {room.room_type === "group" && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-purple-100 text-purple-600">
                        group
                      </span>
                    )}
                  </div>
                </td>
                {days.map((day) => {
                  const dateStr = toDateStr(year, month, day);
                  const state = getCellState(room, dateStr);
                  const isToday = dateStr === todayStr;

                  let cellClass = "";
                  let content: React.ReactNode = null;

                  if (state.type === "available") {
                    cellClass = "bg-emerald-50/50";
                  } else if (state.type === "booked") {
                    const color = BOOKING_COLORS[state.colorIdx];
                    cellClass = `${color.bg} cursor-pointer`;
                    // Show first name on wider cells
                    content = (
                      <span className={`text-[9px] font-medium ${color.text} truncate block`}>
                        {state.booking.guest_name.split(" ")[0]}
                      </span>
                    );
                  } else if (state.type === "blocked") {
                    cellClass = "bg-gray-100 cursor-pointer";
                  }

                  return (
                    <td
                      key={day}
                      onClick={(e) => handleCellClick(e, room, dateStr, state)}
                      className={`py-2 px-0.5 text-center transition-colors ${cellClass} ${
                        isToday ? "ring-1 ring-inset ring-[#2D4A3E]/30" : ""
                      }`}
                    >
                      {content}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rooms.length === 0 && (
        <p className="text-center text-gray-400 text-sm py-8">No rooms configured.</p>
      )}

      {/* Tooltip */}
      {tooltip && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setTooltip(null)} />
          <div
            className="fixed z-30 bg-white rounded-lg shadow-lg border border-gray-200 p-3 w-56"
            style={{ left: `${tooltip.x}px`, top: `${tooltip.y}px`, transform: "translateX(-50%)" }}
          >
            <p className="text-xs font-medium text-gray-400 mb-1">
              {tooltip.roomName} &middot;{" "}
              {new Date(tooltip.dateStr + "T00:00:00").toLocaleDateString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}
            </p>
            {tooltip.state.type === "booked" && (
              <div className="space-y-1">
                <p className="text-sm font-semibold text-gray-900">
                  {tooltip.state.booking.guest_name}
                </p>
                <p className="text-xs text-gray-500">
                  {formatDate(tooltip.state.booking.check_in)} &rarr;{" "}
                  {formatDate(tooltip.state.booking.check_out)}
                </p>
                <p className="text-[10px] text-gray-400">
                  {tooltip.state.booking.rooms_count > 1
                    ? `${tooltip.state.booking.rooms_count} rooms`
                    : ""}
                </p>
              </div>
            )}
            {tooltip.state.type === "blocked" && (
              <p className="text-xs text-gray-600">{tooltip.state.reason}</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
