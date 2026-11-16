"use client";

import { useState, useEffect } from "react";
import { apiRequest } from "@/lib/admin/api-client";
import { FormStatus, type FormMessage } from "../../useAdminAction";

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
  const [msg, setMsg] = useState<FormMessage>(null);

  useEffect(() => {
    apiRequest<{ calendars?: CalendarEntry[] }>("/api/admin/calendar", {
      fallbackError: "We couldn't load your Google calendars. Try reconnecting Google Calendar.",
    })
      .then((r) => {
        if (!r.ok) {
          setMsg({ kind: "error", text: r.error });
          return;
        }
        const data = r.data;
        setCalendars(data.calendars || []);
        // If we have a current selection that matches, keep it. Otherwise default to primary.
        if (currentCalendarId) {
          setSelected(currentCalendarId);
        } else {
          const primary = (data.calendars || []).find((c: CalendarEntry) => c.primary);
          if (primary) setSelected(primary.id);
        }
      })
      .finally(() => setLoading(false));
  }, [currentCalendarId]);

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    setMsg(null);
    try {
      const r = await apiRequest("/api/admin/calendar", {
        method: "PUT",
        json: { calendarId: selected },
        fallbackError: "We couldn't save the calendar choice. Please try again.",
      });
      setMsg(r.ok ? { kind: "ok", text: "Calendar saved." } : { kind: "error", text: r.error });
    } finally {
      setSaving(false);
    }
  }

  const selectedName = calendars.find((c) => c.id === selected)?.summary || selected;

  return (
    <div className="admin-card">
      <h3 className="text-lg font-semibold text-gray-900 mb-1">Booking Calendar</h3>
      <p className="text-sm text-gray-500 mb-4">
        Choose which Google Calendar to use for booking events.
      </p>

      {loading ? (
        <p className="text-sm text-gray-500">Loading calendars...</p>
      ) : calendars.length === 0 ? (
        <p className="text-sm text-gray-500">No calendars found. Try re-authorizing above.</p>
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
                    <span className="ml-2 text-xs text-gray-500 font-normal">(primary)</span>
                  )}
                </p>
                <p className="text-xs text-gray-500">{cal.id}</p>
              </div>
            </label>
          ))}

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="admin-btn-primary"
            >
              {saving ? "Saving..." : "Save Calendar"}
            </button>
            <FormStatus message={msg} />
          </div>
        </div>
      )}
    </div>
  );
}
