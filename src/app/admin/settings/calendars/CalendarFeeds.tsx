"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "@/lib/admin/api-client";
import { ErrorNotice, useAdminAction } from "../../useAdminAction";

type FeedType = "ical" | "google";

interface FeedView {
  id: string;
  kind: string;
  label: string;
  display: string;
  room: string | null;
  roomName: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  lastCount: number | null;
}

interface Data {
  feeds: FeedView[];
  rooms: { slug: string; name: string }[];
  shareWith: string | null;
  managed?: boolean;
  managedFeeds?: { kind: string; label: string }[];
  notSetUp?: boolean;
}

const LOAD_ERROR = "We couldn't load your calendars. Please try again.";

/** "15 Nov, 14:30" in the device's time. */
function when(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}, ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}

function StatusLine({ f }: { f: FeedView }) {
  const errorIsNewer = f.lastError && (!f.lastSyncedAt || (f.lastErrorAt ?? "") >= f.lastSyncedAt);
  return (
    <div className="mt-2 space-y-1 text-sm">
      {f.lastSyncedAt ? (
        <p className="text-gray-700">
          <span className="inline-block size-2 rounded-full bg-green-600 mr-1.5 align-middle" aria-hidden="true" />
          Last synced {when(f.lastSyncedAt)}
          {f.lastCount != null ? `: ${f.lastCount} ${f.lastCount === 1 ? "booking" : "bookings"} found` : ""}
        </p>
      ) : (
        !f.lastError && <p className="text-gray-700">Not synced yet. The first check runs within 15 minutes.</p>
      )}
      {f.lastError && errorIsNewer && (
        <p className="text-red-800">
          <span className="inline-block size-2 rounded-full bg-red-700 mr-1.5 align-middle" aria-hidden="true" />
          Last error{f.lastErrorAt ? ` ${when(f.lastErrorAt)}` : ""}: {f.lastError}
        </p>
      )}
    </div>
  );
}

function FeedForm({
  rooms,
  shareWith,
  initial,
  submitLabel,
  busy,
  onSubmit,
  onCancel,
  error,
}: {
  error?: React.ReactNode;
  rooms: Data["rooms"];
  shareWith: string | null;
  initial?: { type: FeedType; room: string | null };
  submitLabel: string;
  busy: boolean;
  onSubmit: (v: { type: FeedType; value: string; room: string }) => Promise<boolean>;
  onCancel?: () => void;
}) {
  const editing = Boolean(initial);
  const [type, setType] = useState<FeedType>(initial?.type ?? "ical");
  const [value, setValue] = useState("");
  const [room, setRoom] = useState(initial?.room ?? "all");
  const idPrefix = editing ? "edit" : "add";

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await onSubmit({ type, value: value.trim(), room })) setValue("");
      }}
    >
      {!editing && (
        <fieldset>
          <legend className="admin-label">What are you adding?</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(
              [
                ["ical", "Booking site link", "Airbnb, Booking.com or VRBO"],
                ["google", "Google calendar", "A calendar you keep bookings in"],
              ] as const
            ).map(([t, title, hint]) => (
              <label
                key={t}
                className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 ${type === t ? "border-[#2D4A3E] bg-[#f1f5f3]" : "border-gray-300"}`}
              >
                <input type="radio" name={`${idPrefix}-type`} value={t} checked={type === t} onChange={() => setType(t)} className="mt-1" />
                <span>
                  <span className="block text-base font-medium text-gray-900">{title}</span>
                  <span className="block text-sm text-gray-600">{hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div>
        <label htmlFor={`${idPrefix}-value`} className="admin-label">
          {type === "google" ? "Google calendar ID" : "Calendar link"}
        </label>
        <input
          id={`${idPrefix}-value`}
          className="admin-input"
          type={type === "google" ? "text" : "url"}
          inputMode={type === "google" ? "email" : "url"}
          autoComplete="off"
          spellCheck={false}
          placeholder={type === "google" ? "abc123@group.calendar.google.com" : "https://www.airbnb.com/calendar/ical/..."}
          value={value}
          required={!editing}
          onChange={(e) => setValue(e.target.value)}
        />
        {type === "google" ? (
          <p className="mt-1 text-sm text-gray-700">
            {shareWith ? (
              <>
                First, in Google Calendar open the calendar&apos;s settings, choose &quot;Share with specific people&quot; and add{" "}
                <strong className="break-all font-medium text-gray-800">{shareWith}</strong> with &quot;See all event details&quot;.
                The ID is under &quot;Integrate calendar&quot;.
              </>
            ) : (
              "Google calendars can't be connected yet."
            )}
          </p>
        ) : (
          <p className="admin-hint">
            {editing ? "Paste a new link, or leave this empty to keep the current one. " : ""}
            Find it in the booking site&apos;s calendar settings, under export or iCal.
          </p>
        )}
      </div>

      <div>
        <label htmlFor={`${idPrefix}-room`} className="admin-label">
          Which room does it block?
        </label>
        <select id={`${idPrefix}-room`} className="admin-input" value={room} onChange={(e) => setRoom(e.target.value)}>
          <option value="all">Whole property</option>
          {rooms.map((r) => (
            <option key={r.slug} value={r.slug}>
              {r.name}
            </option>
          ))}
        </select>
      </div>

      {error}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="admin-btn-primary" disabled={busy}>
          {busy ? "Checking the link..." : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="admin-btn-secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

export function CalendarFeeds() {
  const [data, setData] = useState<Data | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { pending, error, setError, run } = useAdminAction();
  // Which action the error belongs to, so it shows next to that form (not off-screen on a phone).
  const [errorAt, setErrorAt] = useState<string | null>(null);
  const errorFor = (key: string) =>
    errorAt === key ? <ErrorNotice message={error} onDismiss={() => setError(null)} /> : null;

  const [version, setVersion] = useState(0);
  const load = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let live = true;
    apiRequest<Data>("/api/admin/calendar-feeds", { fallbackError: LOAD_ERROR }).then((r) => {
      if (!live) return;
      if (r.ok) {
        setData(r.data);
        setLoadError(null);
      } else setLoadError(r.error);
    });
    return () => {
      live = false;
    };
  }, [version]);

  if (loadError) {
    return (
      <div className="mt-6 space-y-3">
        <ErrorNotice message={loadError} />
        <button
          type="button"
          className="admin-btn-secondary"
          onClick={() => {
            setLoadError(null);
            load();
          }}
        >
          Try again
        </button>
      </div>
    );
  }
  if (!data) return <p className="mt-6 text-base text-gray-700">Loading your calendars...</p>;

  if (data.managed) {
    return (
      <div className="admin-card mt-6">
        <h2 className="admin-h2">Abeiku looks after your calendars</h2>
        <p className="mt-2 text-base text-gray-700">These are connected for you. Email us to change them.</p>
        <ul className="mt-3 list-disc pl-5 text-base text-gray-800">
          {(data.managedFeeds ?? []).map((f, i) => (
            <li key={i}>{f.label}</li>
          ))}
        </ul>
      </div>
    );
  }

  if (data.notSetUp) {
    return (
      <div className="admin-card mt-6">
        <p className="text-base text-gray-800">Calendar links can&apos;t be changed yet. Please try again later.</p>
      </div>
    );
  }

  const save = async (url: string, method: "POST" | "PUT", v: { type: FeedType; value: string; room: string }, key: string) => {
    setNotice(null);
    setErrorAt(key);
    const r = await run(key, () =>
      apiRequest<{ feed: FeedView }>(url, { method, json: v, fallbackError: "We couldn't save this calendar. Please try again." })
    );
    if (!r?.ok) return false;
    setEditing(null);
    setNotice(method === "POST" ? "Calendar added. Its bookings appear within 15 minutes." : "Calendar saved.");
    load();
    return true;
  };

  const remove = async (id: string) => {
    setNotice(null);
    setErrorAt(`remove-${id}`);
    const r = await run(`remove-${id}`, () =>
      apiRequest(`/api/admin/calendar-feeds/${id}`, { method: "DELETE", fallbackError: "We couldn't remove this calendar. Please try again." })
    );
    if (!r?.ok) return;
    setRemoving(null);
    setNotice("Calendar removed.");
    load();
  };

  return (
    <div className="mt-6 space-y-6">
      {notice && (
        <p role="status" className="admin-success">
          {notice}
        </p>
      )}
      <section aria-labelledby="your-calendars" className="space-y-3">
        <h2 id="your-calendars" className="admin-h2">
          Your calendars
        </h2>
        {data.feeds.length === 0 && (
          <p className="text-base text-gray-700">No calendars yet. Add your first one below.</p>
        )}
        {data.feeds.map((f) => (
          <article key={f.id} className="admin-card">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h3 className="text-base font-semibold text-gray-900">{f.label}</h3>
              <span className="text-sm text-gray-700">{f.room ? (f.roomName ?? "Room removed, counts as whole property") : "Whole property"}</span>
            </div>
            <p className="mt-1 break-all text-sm text-gray-600">{f.display}</p>
            <StatusLine f={f} />

            {editing === f.id ? (
              <div className="mt-4 border-t border-gray-200 pt-4">
                <FeedForm
                  error={errorFor(`edit-${f.id}`)}
                  rooms={data.rooms}
                  shareWith={data.shareWith}
                  initial={{ type: f.kind === "google_calendar" ? "google" : "ical", room: f.room ?? "all" }}
                  submitLabel="Save"
                  busy={pending === `edit-${f.id}`}
                  onSubmit={(v) => save(`/api/admin/calendar-feeds/${f.id}`, "PUT", v, `edit-${f.id}`)}
                  onCancel={() => setEditing(null)}
                />
              </div>
            ) : removing === f.id ? (
              <div className="mt-4 border-t border-gray-200 pt-4">
                {errorFor(`remove-${f.id}`)}
                <p className="text-base text-gray-800">Remove this calendar? Its upcoming bookings leave your Calendar page. No email is sent.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" className="admin-btn-danger" disabled={pending !== null} onClick={() => void remove(f.id)}>
                    {pending === `remove-${f.id}` ? "Removing..." : "Yes, remove"}
                  </button>
                  <button type="button" className="admin-btn-secondary" onClick={() => setRemoving(null)}>
                    Keep it
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" className="admin-btn-secondary" onClick={() => (setEditing(f.id), setRemoving(null))}>
                  Change
                </button>
                <button type="button" className="admin-btn-ghost" onClick={() => (setRemoving(f.id), setEditing(null))}>
                  Remove
                </button>
              </div>
            )}
          </article>
        ))}
      </section>

      <section aria-labelledby="add-calendar" className="admin-card">
        <h2 id="add-calendar" className="admin-h2 mb-4">
          Add a calendar
        </h2>
        <FeedForm
          rooms={data.rooms}
          shareWith={data.shareWith}
          error={errorFor("add")}
          submitLabel="Check and add"
          busy={pending === "add"}
          onSubmit={(v) => save("/api/admin/calendar-feeds", "POST", v, "add")}
        />
      </section>
    </div>
  );
}
