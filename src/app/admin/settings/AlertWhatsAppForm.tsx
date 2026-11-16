"use client";

import { useState } from "react";
import { apiRequest } from "@/lib/admin/api-client";
import { FormStatus, type FormMessage } from "../useAdminAction";

interface AlertWhatsAppFormProps {
  /** False until the alert_whatsapp column exists (docs/go-live-whatsapp.sql). */
  available: boolean;
  phone: string | null;
  /** The hotel's own WhatsApp number is connected (alerts are sent from it). */
  connected: boolean;
}

export function AlertWhatsAppForm({ available, phone, connected }: AlertWhatsAppFormProps) {
  const [value, setValue] = useState(phone ?? "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<FormMessage>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setMsg(null);
    try {
      const r = await apiRequest<{ alert_whatsapp: string | null }>("/api/admin/hotel/alert-whatsapp", {
        method: "PATCH",
        json: { alert_whatsapp: value },
        fallbackError: "We couldn't save the WhatsApp number. Please try again.",
      });
      if (r.ok) {
        setValue(r.data.alert_whatsapp ?? "");
        setMsg({ kind: "ok", text: r.data.alert_whatsapp ? "Saved." : "Saved. No WhatsApp alerts will be sent." });
      } else {
        setMsg({ kind: "error", text: r.error });
      }
    } finally {
      setSaving(false);
    }
  }

  let hint = "One number with country code. Leave empty to stop WhatsApp alerts.";
  if (!available) hint = "This can't be changed yet. Please try again later.";
  else if (!connected) hint = "Alerts are sent from your hotel's WhatsApp number, so they start once WhatsApp is connected in Settings → WhatsApp.";

  return (
    <div className="admin-card">
      <h3 className="text-lg font-semibold text-gray-900 mb-1">WhatsApp booking alerts</h3>
      <p className="text-sm text-gray-600 mb-4">
        The same new-booking and cancellation alerts as the email, sent to the manager on WhatsApp.
      </p>
      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label htmlFor="settings-alert-whatsapp" className="admin-label">Manager&apos;s WhatsApp number</label>
          <input
            id="settings-alert-whatsapp"
            type="tel"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="+233 55 154 2355"
            disabled={!available}
            className="admin-input"
          />
          <p className="text-xs text-gray-500 mt-1">{hint}</p>
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
