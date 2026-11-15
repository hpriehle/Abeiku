"use client";

import { Fragment } from "react";
import { addDays, assignLanes, dayRange, roomsBookedOn, type LaneSegment, type Stay } from "@/lib/bookings/calendar-view";
import { fmtDay, nightsLabel, OccupancyMeter, stayAriaLabel } from "./parts";

const DAYS = 14;

interface Props {
  start: string;
  today: string;
  stays: Stay[];
  totalRooms: number;
  showCancelled: boolean;
  onOpen: (stay: Stay) => void;
}

/** 14-day timeline: one lane per room, a row of "booked/total" per night, bars coloured by source. */
export function Timeline({ start, today, stays, totalRooms, showCancelled, onOpen }: Props) {
  const days = dayRange(start, DAYS);
  const end = addDays(start, DAYS); // exclusive
  const inWindow = stays.filter((s) => s.check_in < end && s.check_out > start);
  const live = inWindow.filter((s) => !s.cancelled);
  const { segments, laneCount } = assignLanes(live, totalRooms);
  const cancelled = showCancelled ? inWindow.filter((s) => s.cancelled) : [];
  const cancelledLanes = assignLanes(
    cancelled.map((s) => ({ ...s, cancelled: false, rooms_count: 1 })),
    1
  );
  const cancelledSegments: LaneSegment[] = cancelledLanes.segments.map((seg) => ({
    lane: seg.lane,
    stay: cancelled.find((c) => c.id === seg.stay.id)!,
  }));

  const HEADER_ROWS = 2;
  const laneRow = (lane: number) => HEADER_ROWS + 1 + lane;
  const cancelledRow = (lane: number) => HEADER_ROWS + 1 + laneCount + lane;
  const totalRows = HEADER_ROWS + laneCount + (cancelled.length ? cancelledLanes.laneCount : 0);

  const col = (date: string) => Math.max(0, Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000));

  function bar(seg: LaneSegment, row: number, firstOfStay: boolean) {
    const s = seg.stay;
    const from = col(s.check_in < start ? start : s.check_in);
    const to = Math.min(DAYS, col(s.check_out > end ? end : s.check_out));
    const span = Math.max(1, to - from);
    const clippedLeft = s.check_in < start;
    const clippedRight = s.check_out > end;
    return (
      <button
        key={`${s.id}-${row}`}
        type="button"
        onClick={() => onOpen(s)}
        aria-label={stayAriaLabel(s, totalRooms)}
        // A 2-room stay draws a bar in each lane; only the first is a tab stop / announced.
        tabIndex={firstOfStay ? 0 : -1}
        aria-hidden={firstOfStay ? undefined : true}
        className={`relative z-10 m-0.5 flex min-w-0 flex-col justify-center overflow-hidden border text-left text-xs leading-tight text-gray-900 hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#2D4A3E] ${
          clippedLeft ? "rounded-l-none border-l-0" : "rounded-l-md"
        } ${clippedRight ? "rounded-r-none border-r-0" : "rounded-r-md"} ${s.cancelled ? "border-dashed border-gray-400 bg-gray-50 text-gray-600" : "border-black/10"}`}
        style={{
          gridColumn: `${from + 2} / span ${span}`,
          gridRow: row,
          background: s.cancelled ? undefined : `${s.source.color}26`,
          boxShadow: clippedLeft ? undefined : `inset 4px 0 0 ${s.source.color}`,
          paddingLeft: clippedLeft ? 6 : 10,
          paddingRight: 6,
        }}
      >
        <span className={`truncate font-semibold ${s.cancelled ? "line-through" : ""}`}>{s.guest_name || "No name"}</span>
        <span className="truncate text-[11px] text-gray-700">
          {s.source.label} · {nightsLabel(s.nights)}
          {s.rooms_count > 1 ? ` · ${s.rooms_count} rooms` : ""}
        </span>
      </button>
    );
  }

  const seen = new Set<string>();
  const firstOf = (id: string) => (seen.has(id) ? false : (seen.add(id), true));

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200" tabIndex={0} role="region" aria-label="14-day timeline, scrolls sideways">
      <div
        className="grid min-w-[760px] bg-white"
        style={{
          gridTemplateColumns: `5.5rem repeat(${DAYS}, minmax(48px, 1fr))`,
          gridTemplateRows: `auto auto repeat(${totalRows - HEADER_ROWS}, 3rem)`,
        }}
      >
        {/* Header: dates */}
        <div className="sticky left-0 z-20 border-b border-gray-200 bg-white" style={{ gridColumn: 1, gridRow: 1 }} />
        {days.map((d, i) => {
          const weekend = [0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay());
          return (
            <div
              key={d}
              style={{ gridColumn: i + 2, gridRow: 1 }}
              className={`border-b border-l border-gray-200 px-1 py-1.5 text-center text-xs ${
                d === today ? "bg-[#2D4A3E] text-white" : weekend ? "bg-gray-50 text-gray-700" : "text-gray-700"
              }`}
            >
              <div className={d === today ? "font-semibold" : ""}>{fmtDay(d, { weekday: "short" })}</div>
              <div className={`text-sm ${d === today ? "font-bold" : "font-semibold text-gray-900"}`}>{fmtDay(d, { day: "numeric", month: "short" })}</div>
              {d === today && <span className="sr-only">(today)</span>}
            </div>
          );
        })}

        {/* Occupancy per night */}
        <div className="sticky left-0 z-20 flex items-center border-b border-gray-200 bg-white px-2 text-xs font-medium text-gray-700" style={{ gridColumn: 1, gridRow: 2 }}>
          Booked
        </div>
        {days.map((d, i) => (
          <div key={d} style={{ gridColumn: i + 2, gridRow: 2 }} className="flex items-center justify-center border-b border-l border-gray-200 py-1.5">
            <OccupancyMeter booked={roomsBookedOn(live, d)} total={totalRooms} compact />
          </div>
        ))}

        {/* Lane labels and grid lines */}
        {Array.from({ length: laneCount }, (_, lane) => (
          laneBackground(`lane-${lane}`, laneRow(lane), lane < totalRooms ? `Room ${lane + 1}` : "Overbooked", lane >= totalRooms ? "alert" : "normal")
        ))}
        {cancelled.length > 0 &&
          Array.from({ length: cancelledLanes.laneCount }, (_, lane) => (
            laneBackground(`c-${lane}`, cancelledRow(lane), lane === 0 ? "Cancelled" : "", "muted")
          ))}

        {segments.map((seg) => bar(seg, laneRow(seg.lane), firstOf(seg.stay.id)))}
        {cancelledSegments.map((seg) => bar(seg, cancelledRow(seg.lane), true))}
      </div>
    </div>
  );

  function laneBackground(key: string, row: number, label: string, tone: "normal" | "alert" | "muted") {
    const alert = tone === "alert";
    const muted = tone === "muted";
    return (
      <Fragment key={key}>
        <div
          style={{ gridColumn: 1, gridRow: row }}
          className={`sticky left-0 z-20 flex items-center border-b border-gray-100 bg-white px-2 text-xs font-medium ${
            alert ? "text-red-700" : muted ? "text-gray-600" : "text-gray-800"
          }`}
        >
          {label}
        </div>
        {days.map((d, i) => (
          <div
            key={d}
            aria-hidden="true"
            style={{ gridColumn: i + 2, gridRow: row }}
            className={`border-b border-l border-gray-100 ${d === today ? "bg-[#2D4A3E]/5" : muted ? "bg-gray-50/60" : ""}`}
          />
        ))}
      </Fragment>
    );
  }
}
