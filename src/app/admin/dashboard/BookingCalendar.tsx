"use client";

import { useState, useCallback } from "react";

interface CalendarBooking {
  id: string;
  guest_name: string;
  room_slug: string;
  check_in: string;
  check_out: string;
  booking_status: string;
  rooms_count: number;
}

interface Props {
  initialBookings: CalendarBooking[];
  initialBlockedDates: string[]; // YYYY-MM-DD dates blocked externally (e.g. Airbnb via Google Calendar)
  initialYear: number;
  initialMonth: number; // 1-12
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Booking color palette (cycles for multiple bookings)
const BOOKING_COLORS = [
  { bg: "bg-emerald-100", text: "text-emerald-800", border: "border-emerald-300" },
  { bg: "bg-blue-100", text: "text-blue-800", border: "border-blue-300" },
  { bg: "bg-amber-100", text: "text-amber-800", border: "border-amber-300" },
  { bg: "bg-purple-100", text: "text-purple-800", border: "border-purple-300" },
  { bg: "bg-rose-100", text: "text-rose-800", border: "border-rose-300" },
  { bg: "bg-cyan-100", text: "text-cyan-800", border: "border-cyan-300" },
];

function toDateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getBookingsForDay(bookings: CalendarBooking[], dateStr: string) {
  return bookings.filter((b) => b.check_in <= dateStr && b.check_out >= dateStr);
}

function getDayType(booking: CalendarBooking, dateStr: string): "check_in" | "check_out" | "staying" {
  if (booking.check_in === dateStr) return "check_in";
  if (booking.check_out === dateStr) return "check_out";
  return "staying";
}

export function BookingCalendar({ initialBookings, initialBlockedDates, initialYear, initialMonth }: Props) {
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [bookings, setBookings] = useState<CalendarBooking[]>(initialBookings);
  const [blockedDates, setBlockedDates] = useState<Set<string>>(new Set(initialBlockedDates));
  const [loading, setLoading] = useState(false);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; bookings: CalendarBooking[]; blocked: boolean; dateStr: string } | null>(null);

  const fetchMonth = useCallback(async (y: number, m: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/bookings/calendar?year=${y}&month=${m}`);
      if (res.ok) {
        const data = await res.json();
        setBookings(data.bookings);
        setBlockedDates(new Set(data.blockedDates ?? []));
      }
    } finally {
      setLoading(false);
    }
  }, []);

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

  // Build calendar grid
  const firstDayOfMonth = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  // Monday=0, Sunday=6
  let startDay = firstDayOfMonth.getDay() - 1;
  if (startDay < 0) startDay = 6;

  const todayStr = (() => {
    const now = new Date();
    return toDateStr(now.getFullYear(), now.getMonth() + 1, now.getDate());
  })();

  // Previous month trailing days
  const prevMonthDays = new Date(year, month - 1, 0).getDate();
  const cells: { day: number; month: number; year: number; isCurrentMonth: boolean }[] = [];

  for (let i = startDay - 1; i >= 0; i--) {
    const d = prevMonthDays - i;
    const pm = month === 1 ? 12 : month - 1;
    const py = month === 1 ? year - 1 : year;
    cells.push({ day: d, month: pm, year: py, isCurrentMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, month, year, isCurrentMonth: true });
  }
  // Fill remaining cells to complete the grid (6 rows x 7)
  const remaining = 42 - cells.length;
  for (let d = 1; d <= remaining; d++) {
    const nm = month === 12 ? 1 : month + 1;
    const ny = month === 12 ? year + 1 : year;
    cells.push({ day: d, month: nm, year: ny, isCurrentMonth: false });
  }

  // Assign a consistent color index per booking
  const bookingColorMap = new Map<string, number>();
  bookings.forEach((b, i) => {
    bookingColorMap.set(b.id, i % BOOKING_COLORS.length);
  });

  function handleCellClick(e: React.MouseEvent, dateStr: string, dayBookings: CalendarBooking[], isBlocked: boolean) {
    if (dayBookings.length === 0 && !isBlocked) {
      setTooltip(null);
      return;
    }
    // Toggle tooltip
    if (tooltip?.dateStr === dateStr) {
      setTooltip(null);
      return;
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setTooltip({ x: rect.left + rect.width / 2, y: rect.bottom + 4, bookings: dayBookings, blocked: isBlocked, dateStr });
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 relative">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-gray-900">Upcoming Stays</h3>
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
              aria-label="Previous month"
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
              aria-label="Next month"
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
          <span className="text-[10px] text-gray-400">→</span>
          <span className="text-xs text-gray-500">Check-in</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-gray-400">←</span>
          <span className="text-xs text-gray-500">Check-out</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-2 bg-emerald-100 rounded-sm" />
          <span className="text-xs text-gray-500">Staying</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-2 bg-gray-300 rounded-sm" />
          <span className="text-xs text-gray-500">Blocked (external)</span>
        </div>
      </div>

      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 bg-white/60 rounded-xl z-10 flex items-center justify-center">
          <span className="text-sm text-gray-500">Loading...</span>
        </div>
      )}

      {/* Day-of-week header */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_NAMES.map((d) => (
          <div key={d} className="text-center text-xs font-medium text-gray-400 uppercase tracking-wider py-2">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 border-t border-l border-gray-100">
        {cells.map((cell, idx) => {
          const dateStr = toDateStr(cell.year, cell.month, cell.day);
          const isToday = dateStr === todayStr;
          const dayBookings = cell.isCurrentMonth ? getBookingsForDay(bookings, dateStr) : [];
          const isBlocked = cell.isCurrentMonth && blockedDates.has(dateStr);
          const maxVisible = 3;
          const overflow = dayBookings.length - maxVisible;

          return (
            <div
              key={idx}
              onClick={(e) => handleCellClick(e, dateStr, dayBookings, isBlocked)}
              className={`
                border-r border-b border-gray-100 min-h-[80px] p-1.5 transition-colors
                ${cell.isCurrentMonth ? "bg-white" : "bg-gray-50/50"}
                ${isBlocked && dayBookings.length === 0 ? "bg-gray-50" : ""}
                ${dayBookings.length > 0 || isBlocked ? "cursor-pointer hover:bg-gray-50" : ""}
              `}
            >
              <div className="flex items-center justify-between mb-1">
                <span
                  className={`
                    text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full
                    ${isToday ? "bg-[#2D4A3E] text-white" : ""}
                    ${!isToday && cell.isCurrentMonth ? "text-gray-700" : ""}
                    ${!isToday && !cell.isCurrentMonth ? "text-gray-300" : ""}
                  `}
                >
                  {cell.day}
                </span>
              </div>

              {/* Booking pills */}
              <div className="space-y-0.5">
                {dayBookings.slice(0, maxVisible).map((b) => {
                  const colorIdx = bookingColorMap.get(b.id) ?? 0;
                  const color = BOOKING_COLORS[colorIdx];
                  const dayType = getDayType(b, dateStr);

                  return (
                    <div
                      key={b.id}
                      className={`
                        text-[10px] leading-tight px-1.5 py-0.5 truncate font-medium
                        ${color.bg} ${color.text}
                        ${dayType === "check_in" ? "rounded-l-full rounded-r-sm" : ""}
                        ${dayType === "check_out" ? "rounded-r-full rounded-l-sm" : ""}
                        ${dayType === "staying" ? "rounded-sm" : ""}
                      `}
                      title={`${b.guest_name} — ${b.room_slug}`}
                    >
                      {dayType === "check_in" && "→ "}
                      {dayType === "check_out" && "← "}
                      {b.guest_name.split(" ")[0]}
                    </div>
                  );
                })}
                {overflow > 0 && (
                  <div className="text-[10px] text-gray-400 px-1.5">+{overflow} more</div>
                )}
                {/* Blocked indicator (only if no bookings already shown) */}
                {isBlocked && dayBookings.length === 0 && (
                  <div className="text-[10px] leading-tight px-1.5 py-0.5 truncate font-medium bg-gray-200 text-gray-500 rounded-sm">
                    Blocked
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Tooltip popover */}
      {tooltip && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setTooltip(null)} />
          <div
            className="fixed z-30 bg-white rounded-lg shadow-lg border border-gray-200 p-3 w-64"
            style={{ left: `${tooltip.x}px`, top: `${tooltip.y}px`, transform: "translateX(-50%)" }}
          >
            <p className="text-xs font-medium text-gray-400 mb-2">
              {new Date(tooltip.dateStr + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </p>
            <div className="space-y-2">
              {tooltip.bookings.map((b) => {
                const colorIdx = bookingColorMap.get(b.id) ?? 0;
                const color = BOOKING_COLORS[colorIdx];
                const dayType = getDayType(b, tooltip.dateStr);
                return (
                  <div key={b.id} className={`p-2 rounded-lg border ${color.bg} ${color.border}`}>
                    <p className={`text-xs font-semibold ${color.text}`}>{b.guest_name}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">
                      {b.room_slug} {b.rooms_count > 1 ? `(${b.rooms_count} rooms)` : ""}
                    </p>
                    <p className="text-[10px] text-gray-500">
                      {dayType === "check_in" && "Checking in today"}
                      {dayType === "check_out" && "Checking out today"}
                      {dayType === "staying" && "Staying"}
                      {" · "}
                      {b.check_in} → {b.check_out}
                    </p>
                  </div>
                );
              })}
              {tooltip.blocked && tooltip.bookings.length === 0 && (
                <div className="p-2 rounded-lg border bg-gray-100 border-gray-300">
                  <p className="text-xs font-semibold text-gray-600">Blocked (external)</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">
                    This date is blocked on Google Calendar (e.g. Airbnb, manual block)
                  </p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
