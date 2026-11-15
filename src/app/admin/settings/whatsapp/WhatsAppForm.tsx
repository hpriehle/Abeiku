"use client";

import { useState } from "react";

const inputClass =
  "admin-input";

export function WhatsAppForm({ connected }: { connected: boolean }) {
  const [token, setToken] = useState("");
  const [phoneId, setPhoneId] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/hotel", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          whatsapp_access_token: token,
          whatsapp_phone_number_id: phoneId,
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      setMsg("Saved successfully! WhatsApp is now connected.");
    } catch {
      setMsg("Failed to save credentials");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-card">
      <h3 className="text-lg font-semibold text-gray-900 mb-1">
        {connected ? "Update Credentials" : "Connect WhatsApp"}
      </h3>
      {connected && (
        <p className="text-sm text-gray-500 mb-4">
          Enter new values below to update your WhatsApp credentials.
        </p>
      )}

      <form onSubmit={handleSave} className="space-y-4 mt-3">
        <div>
          <label htmlFor="whatsappfo-access-token" className="admin-label">Access Token</label>
          <input
            id="whatsappfo-access-token"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={connected ? "••••••••••••••••" : "Paste your access token"}
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="whatsappfo-phone-number-id" className="admin-label">Phone Number ID</label>
          <input
            id="whatsappfo-phone-number-id"
            type="text"
            value={phoneId}
            onChange={(e) => setPhoneId(e.target.value)}
            placeholder={connected ? "Currently configured" : "e.g. 123456789012345"}
            className={inputClass}
          />
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={saving || !token || !phoneId}
            className="admin-btn-primary"
          >
            {saving ? "Saving..." : connected ? "Update Credentials" : "Connect WhatsApp"}
          </button>
          {msg && (
            <span className={`text-sm ${msg.includes("success") ? "text-green-700" : "text-red-600"}`}>
              {msg}
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
