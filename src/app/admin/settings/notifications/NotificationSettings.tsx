"use client";

import { useState } from "react";
import type { Hotel, NotificationPreference } from "@/lib/db";
import { NOTIFICATION_EVENTS } from "@/lib/notifications/types";

interface LogEntry {
  id: string;
  event_type: string;
  channel: "whatsapp" | "email";
  recipient: string;
  subject: string | null;
  body_preview: string | null;
  status: "sent" | "failed" | "skipped";
  created_at: string;
}

interface Props {
  hotel: Hotel;
  preferences: NotificationPreference[];
  recentLog: LogEntry[];
}

export function NotificationSettings({ hotel, preferences, recentLog }: Props) {
  const [prefs, setPrefs] = useState<Record<string, { whatsapp: boolean; email: boolean }>>(() => {
    const map: Record<string, { whatsapp: boolean; email: boolean }> = {};
    for (const ec of NOTIFICATION_EVENTS) {
      const existing = preferences.find((p) => p.event_type === ec.event);
      map[ec.event] = {
        whatsapp: existing?.whatsapp_enabled ?? false,
        email: existing?.email_enabled ?? true,
      };
    }
    return map;
  });

  const [saving, setSaving] = useState<string | null>(null);

  async function togglePref(event: string, channel: "whatsapp" | "email") {
    const current = prefs[event];
    const newValue = channel === "whatsapp" ? !current.whatsapp : !current.email;

    // Optimistic update
    setPrefs((prev) => ({
      ...prev,
      [event]: { ...prev[event], [channel]: newValue },
    }));

    setSaving(event);
    try {
      await fetch("/api/admin/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_type: event,
          ...(channel === "whatsapp" ? { whatsapp_enabled: newValue } : { email_enabled: newValue }),
        }),
      });
    } catch {
      // Revert on error
      setPrefs((prev) => ({
        ...prev,
        [event]: { ...prev[event], [channel]: !newValue },
      }));
    } finally {
      setSaving(null);
    }
  }

  const hasEmail = !!hotel.contact_email;
  const hasWhatsApp = !!hotel.whatsapp_access_token && !!hotel.contact_phone;

  return (
    <div className="space-y-6">
      {/* Toggle grid */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Event Notifications</h3>
        <div className="space-y-1">
          {/* Header */}
          <div className="grid grid-cols-[1fr_72px_72px] gap-4 text-xs font-medium text-gray-400 uppercase tracking-wider px-1 pb-2">
            <span>Event</span>
            <span className="text-center">Email</span>
            <span className="text-center">WhatsApp</span>
          </div>

          {NOTIFICATION_EVENTS.map((ec) => {
            const p = prefs[ec.event];
            const isSaving = saving === ec.event;

            return (
              <div
                key={ec.event}
                className={`grid grid-cols-[1fr_72px_72px] gap-4 items-center py-3 px-1 border-t border-gray-50 ${
                  isSaving ? "opacity-70" : ""
                }`}
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">{ec.label}</p>
                  <p className="text-xs text-gray-500">{ec.description}</p>
                </div>

                {/* Email toggle */}
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => togglePref(ec.event, "email")}
                    disabled={!hasEmail}
                    className={`w-10 h-6 rounded-full transition-colors relative ${
                      p.email ? "bg-[#2D4A3E]" : "bg-gray-200"
                    } ${!hasEmail ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
                  >
                    <span
                      className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                        p.email ? "translate-x-4" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                {/* WhatsApp toggle */}
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => togglePref(ec.event, "whatsapp")}
                    disabled={!hasWhatsApp}
                    className={`w-10 h-6 rounded-full transition-colors relative ${
                      p.whatsapp ? "bg-[#2D4A3E]" : "bg-gray-200"
                    } ${!hasWhatsApp ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
                  >
                    <span
                      className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                        p.whatsapp ? "translate-x-4" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent notifications log */}
      {recentLog.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Recent Notifications</h3>
          <div className="space-y-2">
            {recentLog.map((log) => (
              <div key={log.id} className="flex items-center gap-3 text-sm py-1.5">
                <span
                  className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    log.status === "sent"
                      ? "bg-green-500"
                      : log.status === "failed"
                        ? "bg-red-500"
                        : "bg-gray-400"
                  }`}
                />
                <span className="text-gray-500 text-xs w-16 flex-shrink-0">{log.channel}</span>
                <span className="text-gray-900 flex-1 truncate">
                  {log.subject || log.body_preview}
                </span>
                <span className="text-gray-400 text-xs flex-shrink-0">
                  {new Date(log.created_at).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
