"use client";

import { SOURCES, SOURCE_ORDER, type SourceInfo, type Stay } from "@/lib/bookings/calendar-view";

/** Local calendar date (Harrison's device) as YYYY-MM-DD. */
export function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const utc = (date: string) => new Date(`${date}T00:00:00Z`);

export function fmtDay(date: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }) {
  return utc(date).toLocaleDateString("en-GB", { ...opts, timeZone: "UTC" });
}

export function fmtRange(stay: Pick<Stay, "check_in" | "check_out">) {
  return `${fmtDay(stay.check_in, { day: "numeric", month: "short" })} – ${fmtDay(stay.check_out, { day: "numeric", month: "short" })}`;
}

export function fmtMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency: currency || "GHS", maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
}

export function roomsLabel(n: number, totalRooms: number) {
  if (totalRooms > 1 && n >= totalRooms) return `Entire house (${n} rooms)`;
  return n === 1 ? "1 room" : `${n} rooms`;
}

export function nightsLabel(n: number) {
  return n === 1 ? "1 night" : `${n} nights`;
}

/** Text badge with a colour swatch. The text carries the meaning; the colour only helps scanning. */
export function SourceBadge({ source, className = "" }: { source: SourceInfo; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border border-gray-300 bg-white px-2 py-0.5 text-xs font-medium text-gray-800 ${className}`}>
      <span aria-hidden="true" className="size-2.5 rounded-full shrink-0" style={{ background: source.color }} />
      {source.label}
    </span>
  );
}

export function SourceLegend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-gray-700" aria-label="Booking sources">
      {SOURCE_ORDER.map((k) => (
        <li key={k} className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="size-2.5 rounded-sm" style={{ background: SOURCES[k].color }} />
          {SOURCES[k].label}
        </li>
      ))}
    </ul>
  );
}

/** "2 of 3 rooms booked" as small segments plus text (text is what screen readers get). */
/** `textFromSm`: hide the "2/3" text below the sm breakpoint (narrow month cells on a phone). */
export function OccupancyMeter({ booked, total, compact = false, textFromSm = false }: { booked: number; total: number; compact?: boolean; textFromSm?: boolean }) {
  const over = booked > total;
  const label = over ? `${booked} of ${total} rooms booked, overbooked` : `${booked} of ${total} rooms booked`;
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1" title={label}>
      <div className="flex gap-0.5" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={`h-1.5 ${compact ? "w-2" : "w-3"} rounded-sm ${i < booked ? (over ? "bg-red-700" : "bg-[#2D4A3E]") : "bg-gray-200"}`}
          />
        ))}
      </div>
      <span className={`text-[11px] leading-none tabular-nums ${textFromSm ? "hidden sm:inline" : ""} ${over ? "font-semibold text-red-700" : "text-gray-700"}`}>
        <span aria-hidden="true">
          {booked}/{total}
          {over ? "!" : ""}
        </span>
        <span className="sr-only">{label}</span>
      </span>
    </div>
  );
}

export function stayAriaLabel(stay: Stay, totalRooms: number) {
  return `${stay.guest_name || "No name"}, ${stay.source.label}, ${fmtRange(stay)}, ${nightsLabel(stay.nights)}, ${roomsLabel(
    stay.rooms_count,
    totalRooms
  )}${stay.cancelled ? ", cancelled" : ""}`;
}
