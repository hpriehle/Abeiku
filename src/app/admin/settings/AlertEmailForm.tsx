"use client";

import { useState } from "react";
import { apiRequest } from "@/lib/admin/api-client";
import { FormStatus, type FormMessage } from "../useAdminAction";

interface AlertEmailFormProps {
  /** False until the alert_email column exists (docs/c2-alerts/booking-alerts.sql). */
  available: boolean;
  email: string | null;
}

export function AlertEmailForm({ available, email }: AlertEmailFormProps) {
  const [value, setValue] = useState(email ?? "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<FormMessage>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setMsg(null);
    try {
      const r = await apiRequest<{ alert_email: string | null }>("/api/admin/hotel/alert-email", {
        method: "PATCH",
        json: { alert_email: value },
        fallbackError: "We couldn't save the alert email. Please try again.",
      });
      if (r.ok) {
        setValue(r.data.alert_email ?? "");
        setMsg({ kind: "ok", text: r.data.alert_email ? "Saved." : "Saved. No alert emails will be sent." });
      } else {
        setMsg({ kind: "error", text: r.error });
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-card">
      <h3 className="text-lg font-semibold text-gray-900 mb-1">Booking alerts</h3>
      <p className="text-sm text-gray-600 mb-4">
        We email you when a booking comes in or is cancelled, and send a list of guests arriving tomorrow.
      </p>
      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label htmlFor="settings-alert-email" className="admin-label">Alert emails go to</label>
          <input
            id="settings-alert-email"
            type="email"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="you@yourhotel.com"
            disabled={!available}
            className="admin-input"
          />
          <p className="text-xs text-gray-500 mt-1">
            {available ? "One address. Leave empty to stop alert emails." : "This can't be changed yet. Please try again later."}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button type="submit" disabled={saving || !available} className="admin-btn-primary">
            {saving ? "Saving..." : "Save"}
          </button>
          <FormStatus message={msg} />
        </div>
      </form>
    </div>
  );
}
