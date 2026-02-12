"use client";

import { useState, useEffect } from "react";

interface CalendarEntry {
  id: string;
  summary: string;
  primary: boolean;
}

export function CalendarPicker({ currentCalendarId }: { currentCalendarId: string | null }) {
  const [calendars, setCalendars] = useState<CalendarEntry[]>([]);
  const [selected, setSelected] = useState(currentCalendarId || "primary");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch("/api/admin/calendar")
      .then((res) => res.json())
      .then((data) => {
        setCalendars(data.calendars || []);
        // If we have a current selection that matches, keep it. Otherwise default to primary.
        if (currentCalendarId) {
          setSelected(currentCalendarId);
        } else {
          const primary = (data.calendars || []).find((c: CalendarEntry) => c.primary);
          if (primary) setSelected(primary.id);
        }
      })
      .catch(() => setMsg("Failed to load calendars"))
      .finally(() => setLoading(false));
  }, [currentCalendarId]);

  async function handleSave() {
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/calendar", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ calendarId: selected }),
      });
      if (!res.ok) throw new Error();
      setMsg("Calendar saved");
    } catch {
      setMsg("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const selectedName = calendars.find((c) => c.id === selected)?.summary || selected;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-1">Booking Calendar</h3>
      <p className="text-sm text-gray-500 mb-4">
        Choose which Google Calendar to use for booking events.
      </p>

      {loading ? (
        <p className="text-sm text-gray-400">Loading calendars...</p>
      ) : calendars.length === 0 ? (
        <p className="text-sm text-gray-400">No calendars found. Try re-authorizing above.</p>
      ) : (
        <div className="space-y-3">
          {calendars.map((cal) => (
            <label
              key={cal.id}
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                selected === cal.id
                  ? "border-[#2D4A3E] bg-[#2D4A3E]/5"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <input
                type="radio"
                name="calendar"
                value={cal.id}
                checked={selected === cal.id}
                onChange={() => setSelected(cal.id)}
                className="text-[#2D4A3E] focus:ring-[#2D4A3E]"
              />
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {cal.summary}
                  {cal.primary && (
                    <span className="ml-2 text-xs text-gray-400 font-normal">(primary)</span>
                  )}
                </p>
                <p className="text-xs text-gray-400">{cal.id}</p>
              </div>
            </label>
          ))}

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2.5 bg-[#2D4A3E] text-white rounded-lg text-sm font-medium hover:bg-[#1E3329] transition-colors disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Calendar"}
            </button>
            {msg && (
              <span className={`text-sm ${msg.includes("saved") ? "text-green-600" : "text-red-600"}`}>
                {msg}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
