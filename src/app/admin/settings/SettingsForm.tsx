"use client";

import { useState } from "react";
import type { Hotel } from "@/lib/db";

interface SettingsFormProps {
  hotel: Hotel;
}

const inputClass =
  "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#2D4A3E] focus:border-transparent";

export function SettingsForm({ hotel }: SettingsFormProps) {
  const [hotelForm, setHotelForm] = useState({
    contact_phone: hotel.contact_phone || "",
    contact_email: hotel.contact_email || "",
    location_city: hotel.location_city || "",
    location_country: hotel.location_country || "",
    location_lat: hotel.location_lat || 0,
    location_lng: hotel.location_lng || 0,
    check_in_time: hotel.check_in_time || "14:00",
    check_out_time: hotel.check_out_time || "11:00",
    currency: hotel.currency || "GHS",
    wifi_password: hotel.wifi_password || "",
  });
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
        body: JSON.stringify(hotelForm),
      });
      if (!res.ok) throw new Error("Failed to save");
      setMsg("Saved successfully");
    } catch {
      setMsg("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Hotel Information</h3>
      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Hotel Name</label>
          <p className="text-sm text-gray-900 bg-gray-50 px-3 py-2 rounded-lg">{hotel.name}</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
            <select
              value={hotelForm.location_country}
              onChange={(e) => {
                const country = e.target.value;
                setHotelForm((f) => ({
                  ...f,
                  location_country: country,
                  currency: country === "United States" ? "USD" : "GHS",
                }));
              }}
              className={inputClass}
            >
              <option value="Ghana">Ghana</option>
              <option value="United States">United States</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contact Phone</label>
            <div className="flex">
              <span className="inline-flex items-center px-3 border border-r-0 border-gray-300 rounded-l-lg bg-gray-50 text-sm text-gray-500">
                {hotelForm.location_country === "United States" ? "+1" : "+233"}
              </span>
              <input
                type="tel"
                value={hotelForm.contact_phone}
                onChange={(e) => setHotelForm((f) => ({ ...f, contact_phone: e.target.value }))}
                className={`${inputClass} rounded-l-none`}
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
            <input
              type="text"
              value={hotelForm.location_city}
              onChange={(e) => setHotelForm((f) => ({ ...f, location_city: e.target.value }))}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contact Email</label>
            <input
              type="email"
              value={hotelForm.contact_email}
              onChange={(e) => setHotelForm((f) => ({ ...f, contact_email: e.target.value }))}
              className={inputClass}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Check-in Time</label>
            <input
              type="time"
              value={hotelForm.check_in_time}
              onChange={(e) => setHotelForm((f) => ({ ...f, check_in_time: e.target.value }))}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Check-out Time</label>
            <input
              type="time"
              value={hotelForm.check_out_time}
              onChange={(e) => setHotelForm((f) => ({ ...f, check_out_time: e.target.value }))}
              className={inputClass}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
            <select
              value={hotelForm.currency}
              onChange={(e) => setHotelForm((f) => ({ ...f, currency: e.target.value }))}
              className={inputClass}
            >
              <option value="GHS">GHS (Cedi)</option>
              <option value="USD">USD (Dollar)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Wi-Fi Password</label>
            <input
              type="text"
              value={hotelForm.wifi_password}
              onChange={(e) => setHotelForm((f) => ({ ...f, wifi_password: e.target.value }))}
              placeholder="Guest Wi-Fi password"
              className={inputClass}
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2 bg-[#2D4A3E] text-white rounded-lg text-sm font-medium hover:bg-[#1E3329] transition-colors disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Changes"}
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
