"use client";

import type { Movements as M, Stay } from "@/lib/bookings/calendar-view";
import { fmtDay, nightsLabel, roomsLabel, SourceBadge, stayAriaLabel } from "./parts";

interface Props {
  movements: M;
  totalRooms: number;
  onOpen: (stay: Stay) => void;
}

function Group({ title, stays, kind, totalRooms, onOpen, showDay }: { title: string; stays: Stay[]; kind: "arrivals" | "departures"; totalRooms: number; onOpen: (s: Stay) => void; showDay?: boolean }) {
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-600">{title}</h4>
      {stays.length === 0 ? (
        <p className="mt-1 text-sm text-gray-600">{kind === "arrivals" ? "No arrivals." : "No departures."}</p>
      ) : (
        <ul className="mt-1 divide-y divide-gray-100">
          {stays.map((s) => (
            <li key={s.id}>
              <button type="button" onClick={() => onOpen(s)} aria-label={stayAriaLabel(s, totalRooms)} className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 py-2 text-left hover:bg-gray-50">
                <span className="min-w-0 flex-1 truncate font-medium text-gray-900">{s.guest_name || "No name"}</span>
                <SourceBadge source={s.source} />
                <span className="w-full text-xs text-gray-700">
                  {showDay ? `${fmtDay(kind === "arrivals" ? s.check_in : s.check_out)} · ` : ""}
                  {nightsLabel(s.nights)} · {roomsLabel(s.rooms_count, totalRooms)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Upcoming arrivals and departures: today, tomorrow, rest of the week. */
export function Movements({ movements, totalRooms, onOpen }: Props) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {(["arrivals", "departures"] as const).map((kind) => (
        <section key={kind} className="admin-card" aria-labelledby={`mv-${kind}`}>
          <h3 id={`mv-${kind}`} className="admin-h2 mb-3">
            {kind === "arrivals" ? "Arrivals" : "Departures"}
          </h3>
          <div className="space-y-4">
            <Group title="Today" stays={movements[kind].today} kind={kind} totalRooms={totalRooms} onOpen={onOpen} />
            <Group title="Tomorrow" stays={movements[kind].tomorrow} kind={kind} totalRooms={totalRooms} onOpen={onOpen} />
            <Group title="This week" stays={movements[kind].week} kind={kind} totalRooms={totalRooms} onOpen={onOpen} showDay />
          </div>
        </section>
      ))}
    </div>
  );
}
