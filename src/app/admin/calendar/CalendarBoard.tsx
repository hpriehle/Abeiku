"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { apiRequest } from "@/lib/admin/api-client";
import { addDays, groupStays, movements, type CalendarBookingRow } from "@/lib/bookings/calendar-view";
import { ErrorNotice } from "../useAdminAction";
import { BookingDetailModal } from "../bookings/BookingDetailModal";
import { BookingDrawer } from "./BookingDrawer";
import { MonthGrid } from "./MonthGrid";
import { Movements } from "./Movements";
import { Timeline } from "./Timeline";
import { fmtDay, localToday, SourceLegend } from "./parts";

interface CalendarData {
  bookings: CalendarBookingRow[];
  totalRooms: number;
  currency: string;
  rooms: { slug: string; name: string }[];
}

type Loaded = { key: string; ok: true; data: CalendarData } | { key: string; ok: false; error: string };
type RangeState = { status: "loading" } | { status: "error"; error: string } | { status: "ready"; data: CalendarData };

// Grouping needs the neighbours of a stay, so every request reaches a month past each side.
const PAD = 31;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const noSubscribe = () => () => {};

/** Loads bookings overlapping [from, to] (read-only). Loading is derived from the key, so no state is set inside the effect body. */
function useRange(from: string | null, to: string | null, reload: number): RangeState {
  const key = from && to ? `${from}|${to}|${reload}` : null;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  useEffect(() => {
    if (!key || !from || !to) return;
    let live = true;
    apiRequest<CalendarData>(`/api/admin/calendar?from=${from}&to=${to}`, {
      fallbackError: "We couldn't load the calendar. Please try again.",
    }).then((r) => {
      if (live) setLoaded(r.ok ? { key, ok: true, data: r.data } : { key, ok: false, error: r.error });
    });
    return () => {
      live = false;
    };
  }, [key, from, to]);
  if (!loaded || loaded.key !== key) return { status: "loading" };
  return loaded.ok ? { status: "ready", data: loaded.data } : { status: "error", error: loaded.error };
}

/**
 * The hotel's bookings from every source in one place: a 14-day timeline (a lane per room)
 * or a month view, the next arrivals and departures, and a read-only detail drawer.
 * `onDashboard`: titled "Calendar" with a link to the full page.
 */
export function CalendarBoard({ onDashboard = false }: { onDashboard?: boolean }) {
  // Today on Harrison's device; null during the server render.
  const today = useSyncExternalStore(noSubscribe, localToday, () => null);
  const [view, setView] = useState<"timeline" | "month">("timeline");
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [showCancelled, setShowCancelled] = useState(false);
  const [reload, setReload] = useState(0);
  const [openStayId, setOpenStayId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);

  // The window on screen.
  let viewFrom: string | null = null;
  let viewTo: string | null = null; // exclusive
  let title = "";
  let year = 0;
  let month = 0;
  if (today) {
    if (view === "timeline") {
      viewFrom = addDays(today, weekOffset * 7);
      viewTo = addDays(viewFrom, 14);
      title = `${fmtDay(viewFrom, { day: "numeric", month: "short" })} – ${fmtDay(addDays(viewTo, -1), { day: "numeric", month: "short", year: "numeric" })}`;
    } else {
      const base = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 + monthOffset, 1));
      year = base.getUTCFullYear();
      month = base.getUTCMonth() + 1;
      viewFrom = base.toISOString().slice(0, 10);
      viewTo = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
      title = `${MONTHS[month - 1]} ${year}`;
    }
  }

  const range = useRange(viewFrom && addDays(viewFrom, -PAD), viewTo && addDays(viewTo, PAD), reload);
  const upcoming = useRange(today && addDays(today, -PAD), today && addDays(today, 8 + PAD), reload);

  const stays = useMemo(() => (range.status === "ready" ? groupStays(range.data.bookings) : []), [range]);
  const upcomingStays = useMemo(() => (upcoming.status === "ready" ? groupStays(upcoming.data.bookings) : []), [upcoming]);
  const mv = useMemo(() => (today ? movements(upcomingStays, today) : null), [upcomingStays, today]);

  const meta = range.status === "ready" ? range.data : upcoming.status === "ready" ? upcoming.data : null;
  const totalRooms = meta?.totalRooms ?? 1;
  const currency = meta?.currency ?? "GHS";

  const inView = stays.filter((s) => viewFrom && viewTo && s.check_in < viewTo && s.check_out > viewFrom && (showCancelled || !s.cancelled));
  const openStay = openStayId ? [...stays, ...upcomingStays].find((s) => s.id === openStayId) ?? null : null;

  const selected = selectedDay ?? (today && viewFrom && viewTo && today >= viewFrom && today < viewTo ? today : null);

  function move(dir: -1 | 0 | 1) {
    setSelectedDay(null);
    if (view === "timeline") setWeekOffset((w) => (dir === 0 ? 0 : w + dir));
    else setMonthOffset((m) => (dir === 0 ? 0 : m + dir));
  }

  return (
    <div className="space-y-6">
      <section className="admin-card" aria-labelledby="cal-title">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="mr-auto flex flex-wrap items-baseline gap-x-3">
            <h2 id="cal-title" className="admin-h2">
              {onDashboard ? "Calendar" : "All bookings"}
            </h2>
            {onDashboard && (
              <Link href="/admin/calendar" className="text-sm text-[#1d4ed8] underline">
                Open full calendar
              </Link>
            )}
          </div>
          <div role="group" aria-label="View" className="inline-flex rounded-lg border border-[#868e9c] p-0.5">
            {(
              [
                ["timeline", "14 days"],
                ["month", "Month"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => {
                  setView(v);
                  setSelectedDay(null);
                }}
                className={`min-h-10 rounded-md px-3 text-sm font-medium ${view === v ? "bg-[#2D4A3E] text-white" : "text-gray-800 hover:bg-gray-100"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button type="button" className="admin-btn admin-btn-secondary size-10 p-0" onClick={() => move(-1)} aria-label={view === "timeline" ? "Previous week" : "Previous month"}>
            <ChevronLeft className="size-5" aria-hidden="true" />
          </button>
          <button type="button" className="admin-btn admin-btn-secondary min-h-10" onClick={() => move(0)}>
            Today
          </button>
          <button type="button" className="admin-btn admin-btn-secondary size-10 p-0" onClick={() => move(1)} aria-label={view === "timeline" ? "Next week" : "Next month"}>
            <ChevronRight className="size-5" aria-hidden="true" />
          </button>
          <p className="ml-1 text-sm font-semibold text-gray-900" aria-live="polite">
            {title}
          </p>
          <label className="ml-auto inline-flex min-h-10 cursor-pointer items-center gap-2 text-sm text-gray-800">
            <input type="checkbox" className="size-4 accent-[#2D4A3E]" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} />
            Show cancelled
          </label>
        </div>

        <div className="mb-4">
          <SourceLegend />
        </div>

        {range.status === "loading" || !today ? (
          <div role="status" className="flex h-56 items-center justify-center rounded-lg border border-dashed border-gray-300 text-sm text-gray-600">
            Loading bookings…
          </div>
        ) : range.status === "error" ? (
          <div className="space-y-3">
            <ErrorNotice message={range.error} />
            <button type="button" className="admin-btn admin-btn-secondary" onClick={() => setReload((n) => n + 1)}>
              Try again
            </button>
          </div>
        ) : (
          <>
            {inView.length === 0 && (
              <p className="mb-3 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700" role="status">
                No bookings {view === "timeline" ? "in these two weeks" : "this month"}
                {showCancelled ? "" : " (cancelled ones are hidden)"}.
              </p>
            )}
            {view === "timeline" && viewFrom ? (
              <Timeline start={viewFrom} today={today} stays={stays} totalRooms={totalRooms} showCancelled={showCancelled} onOpen={(s) => setOpenStayId(s.id)} />
            ) : (
              <MonthGrid
                year={year}
                month={month}
                today={today}
                stays={stays}
                totalRooms={totalRooms}
                showCancelled={showCancelled}
                selected={selected}
                onSelect={setSelectedDay}
                onOpen={(s) => setOpenStayId(s.id)}
              />
            )}
          </>
        )}
      </section>

      <div>
        <h2 className="sr-only">Arrivals and departures</h2>
        {upcoming.status === "error" ? (
          <div className="admin-card space-y-3">
            <ErrorNotice message={upcoming.error} />
            <button type="button" className="admin-btn admin-btn-secondary" onClick={() => setReload((n) => n + 1)}>
              Try again
            </button>
          </div>
        ) : upcoming.status === "loading" || !mv ? (
          <div role="status" className="admin-card text-sm text-gray-600">
            Loading arrivals and departures…
          </div>
        ) : (
          <Movements movements={mv} totalRooms={totalRooms} onOpen={(s) => setOpenStayId(s.id)} />
        )}
      </div>

      {openStay && (
        <BookingDrawer
          stay={openStay}
          totalRooms={totalRooms}
          currency={currency}
          onClose={() => setOpenStayId(null)}
          onEdit={(id) => {
            setOpenStayId(null);
            setEditId(id);
          }}
        />
      )}
      {editId && (
        <BookingDetailModal
          bookingId={editId}
          rooms={meta?.rooms ?? []}
          currency={currency}
          onClose={() => setEditId(null)}
          onUpdated={() => setReload((n) => n + 1)}
        />
      )}
    </div>
  );
}
