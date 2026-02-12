"use client";

import { useCallback, useRef, useState } from "react";

interface BookingCalendarProps {
  activeField: "checkin" | "checkout";
  checkIn: Date | null;
  checkOut: Date | null;
  onDateSelect: (date: Date) => void;
}

const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isBeforeDay(a: Date, b: Date): boolean {
  const aa = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const bb = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return aa < bb;
}

function isBetween(d: Date, start: Date, end: Date): boolean {
  const dd = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const s = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
  const e = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();
  return dd > s && dd < e;
}

export default function BookingCalendar({
  activeField,
  checkIn,
  checkOut,
  onDateSelect,
}: BookingCalendarProps) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [viewYear, setViewYear] = useState(today.getFullYear());

  // Swipe support
  const touchStartX = useRef(0);

  const prevMonth = useCallback(() => {
    setViewMonth((m) => {
      if (m === 0) {
        setViewYear((y) => y - 1);
        return 11;
      }
      return m - 1;
    });
  }, []);

  const nextMonth = useCallback(() => {
    setViewMonth((m) => {
      if (m === 11) {
        setViewYear((y) => y + 1);
        return 0;
      }
      return m + 1;
    });
  }, []);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      if (diff > 0) nextMonth();
      else prevMonth();
    }
  };

  // Can't go before current month
  const canGoPrev =
    viewYear > today.getFullYear() ||
    (viewYear === today.getFullYear() && viewMonth > today.getMonth());

  // Build calendar grid
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const monthLabel = new Date(viewYear, viewMonth).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <div
      className="bg-white rounded-2xl shadow-sm mx-4 p-4 select-none"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Month header */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={prevMonth}
          disabled={!canGoPrev}
          className="w-9 h-9 flex items-center justify-center rounded-full text-gray-600 hover:bg-gray-100 disabled:opacity-20 disabled:pointer-events-none transition-colors"
          aria-label="Previous month"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M12.5 15L7.5 10L12.5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <span className="text-sm font-semibold text-gray-900">{monthLabel}</span>
        <button
          onClick={nextMonth}
          className="w-9 h-9 flex items-center justify-center rounded-full text-gray-600 hover:bg-gray-100 transition-colors"
          aria-label="Next month"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M7.5 5L12.5 10L7.5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* Day labels */}
      <div className="grid grid-cols-7 mb-2">
        {DAYS.map((d) => (
          <div key={d} className="text-center text-xs font-medium text-gray-400 py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Date grid */}
      <div className="grid grid-cols-7">
        {cells.map((day, i) => {
          if (day === null) {
            return <div key={`empty-${i}`} className="h-10" />;
          }

          const date = new Date(viewYear, viewMonth, day);
          const isPast = isBeforeDay(date, today);
          const isToday = isSameDay(date, today);
          const isCheckIn = checkIn ? isSameDay(date, checkIn) : false;
          const isCheckOut = checkOut ? isSameDay(date, checkOut) : false;
          const isInRange =
            checkIn && checkOut ? isBetween(date, checkIn, checkOut) : false;

          // Determine cell background for range highlighting
          let cellBg = "";
          if (isInRange) {
            cellBg = "bg-[#075E54]/10";
          } else if (isCheckIn && checkOut) {
            cellBg = "bg-gradient-to-r from-transparent to-[#075E54]/10";
          } else if (isCheckOut && checkIn) {
            cellBg = "bg-gradient-to-l from-transparent to-[#075E54]/10";
          }

          // Determine circle style
          let circleClass = "";
          if (isCheckIn || isCheckOut) {
            circleClass = "bg-[#075E54] text-white";
          } else if (isToday) {
            circleClass = "ring-2 ring-[#128C7E] text-gray-900";
          }

          return (
            <div key={`day-${day}`} className={`h-10 flex items-center justify-center ${cellBg}`}>
              <button
                disabled={isPast}
                onClick={() => onDateSelect(date)}
                className={`w-9 h-9 rounded-full text-sm font-medium transition-colors
                  ${circleClass}
                  ${isPast ? "text-gray-300 cursor-default" : ""}
                  ${!isPast && !isCheckIn && !isCheckOut && !isToday ? "text-gray-800 hover:bg-gray-100 active:bg-gray-200" : ""}
                `}
              >
                {day}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
