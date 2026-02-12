"use client";

import { useState } from "react";

const inputClass =
  "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#2D4A3E] focus:border-transparent";

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
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
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
          <label className="block text-sm font-medium text-gray-700 mb-1">Access Token</label>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={connected ? "••••••••••••••••" : "Paste your access token"}
            className={inputClass}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number ID</label>
          <input
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
            className="px-5 py-2.5 bg-[#2D4A3E] text-white rounded-lg text-sm font-medium hover:bg-[#1E3329] transition-colors disabled:opacity-50"
          >
            {saving ? "Saving..." : connected ? "Update Credentials" : "Connect WhatsApp"}
          </button>
          {msg && (
            <span className={`text-sm ${msg.includes("success") ? "text-green-600" : "text-red-600"}`}>
              {msg}
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
