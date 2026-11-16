"use client";

import { addDays, roomsBookedOn, type Stay } from "@/lib/bookings/calendar-view";
import { fmtDay, nightsLabel, OccupancyMeter, roomsLabel, SourceBadge, stayAriaLabel } from "./parts";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface Props {
  year: number;
  month: number; // 1-12
  today: string;
  stays: Stay[];
  totalRooms: number;
  showCancelled: boolean;
  selected: string | null;
  onSelect: (date: string) => void;
  onOpen: (stay: Stay) => void;
}

/** Stays that have the night starting on `date`, or arrive/leave that day. */
function staysOn(stays: Stay[], date: string) {
  return stays.filter((s) => s.check_in <= date && date <= s.check_out);
}

/**
 * Month view. Every day shows "booked/total" rooms; on wider screens also the guests that night.
 * Tapping a day lists its stays underneath (the phone view relies on this).
 */
export function MonthGrid({ year, month, today, stays, totalRooms, showCancelled, selected, onSelect, onOpen }: Props) {
  const first = `${year}-${String(month).padStart(2, "0")}-01`;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lead = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday first
  const live = stays.filter((s) => !s.cancelled);
  const visible = showCancelled ? stays : live;
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => addDays(first, i)),
  ];
  while (cells.length % 7) cells.push(null);

  const dayStays = selected ? staysOn(visible, selected) : [];

  return (
    <div>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-gray-200 bg-gray-200">
        {WEEKDAYS.map((d) => (
          <div key={d} className="bg-gray-50 py-1.5 text-center text-xs font-medium text-gray-700">
            {d}
          </div>
        ))}
        {cells.map((date, i) => {
          if (!date) return <div key={`e${i}`} className="bg-gray-50" aria-hidden="true" />;
          const booked = roomsBookedOn(live, date);
          const nightStays = visible.filter((s) => s.check_in <= date && date < s.check_out);
          const arrivals = live.filter((s) => s.check_in === date).length;
          const departures = live.filter((s) => s.check_out === date).length;
          const isToday = date === today;
          const isSelected = date === selected;
          const label = `${fmtDay(date, { weekday: "long", day: "numeric", month: "long" })}${isToday ? ", today" : ""}: ${booked} of ${totalRooms} rooms booked${
            arrivals ? `, ${arrivals} arriving` : ""
          }${departures ? `, ${departures} leaving` : ""}`;
          return (
            <button
              key={date}
              type="button"
              onClick={() => onSelect(date)}
              aria-label={label}
              aria-pressed={isSelected}
              className={`flex min-h-16 flex-col gap-1 bg-white p-1 text-left align-top hover:bg-gray-50 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-[#2D4A3E] sm:min-h-24 sm:p-1.5 ${
                isSelected ? "ring-2 ring-inset ring-[#2D4A3E]" : ""
              }`}
            >
              <span
                aria-hidden="true"
                className={`inline-flex size-6 items-center justify-center rounded-full text-xs font-semibold ${
                  isToday ? "bg-[#2D4A3E] text-white" : "text-gray-900"
                }`}
              >
                {Number(date.slice(8))}
              </span>
              <span aria-hidden="true">
                <OccupancyMeter booked={booked} total={totalRooms} compact textFromSm />
              </span>
              <span aria-hidden="true" className="hidden w-full min-w-0 flex-col gap-0.5 sm:flex">
                {nightStays.slice(0, 2).map((s) => (
                  <span
                    key={s.id}
                    className={`truncate rounded px-1 text-[11px] leading-4 text-gray-900 ${s.cancelled ? "line-through text-gray-600" : ""}`}
                    style={{ background: s.cancelled ? "#f3f4f6" : `${s.source.color}26`, boxShadow: `inset 3px 0 0 ${s.source.color}` }}
                  >
                    {s.guest_name.split(" ")[0] || "No name"}
                  </span>
                ))}
                {nightStays.length > 2 && <span className="text-[11px] text-gray-700">+{nightStays.length - 2} more</span>}
              </span>
            </button>
          );
        })}
      </div>

      {selected && (
        <section className="mt-4" aria-labelledby="day-heading">
          <h3 id="day-heading" className="text-sm font-semibold text-gray-900">
            {fmtDay(selected, { weekday: "long", day: "numeric", month: "long" })}
          </h3>
          {dayStays.length === 0 ? (
            <p className="mt-1 text-sm text-gray-600">No bookings this day.</p>
          ) : (
            <ul className="mt-2 divide-y divide-gray-100 rounded-lg border border-gray-200">
              {dayStays.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(s)}
                    aria-label={stayAriaLabel(s, totalRooms)}
                    className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-left hover:bg-gray-50"
                  >
                    <span className={`font-medium text-gray-900 ${s.cancelled ? "line-through" : ""}`}>{s.guest_name || "No name"}</span>
                    <SourceBadge source={s.source} />
                    <span className="text-xs text-gray-700">
                      {s.check_in === selected ? "Arrives" : s.check_out === selected ? "Leaves" : "Staying"} · {nightsLabel(s.nights)} ·{" "}
                      {roomsLabel(s.rooms_count, totalRooms)}
                      {s.cancelled ? " · cancelled" : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
