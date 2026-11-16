"use client";

import { useState } from "react";
import { apiRequest } from "@/lib/admin/api-client";
import { FormStatus, type FormMessage } from "../useAdminAction";
import type { HotelView } from "@/lib/admin/hotel-view";

interface SettingsFormProps {
  hotel: HotelView;
}

const inputClass =
  "admin-input";

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
  const [msg, setMsg] = useState<FormMessage>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setMsg(null);
    try {
      const r = await apiRequest("/api/admin/hotel", {
        method: "PATCH",
        json: hotelForm,
        fallbackError: "We couldn't save your hotel details. Your changes are still in the form; please try again.",
      });
      setMsg(r.ok ? { kind: "ok", text: "Saved." } : { kind: "error", text: r.error });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-card">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Hotel Information</h3>
      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="admin-label">Hotel Name</label>
          <p className="text-sm text-gray-900 bg-gray-50 px-3 py-2 rounded-lg">{hotel.name}</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="settingsfo-country" className="admin-label">Country</label>
            <select
              id="settingsfo-country"
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
            <label htmlFor="settingsfo-contact-phone" className="admin-label">Contact Phone</label>
            <div className="flex">
              <span className="inline-flex items-center px-3 border border-r-0 border-gray-300 rounded-l-lg bg-gray-50 text-sm text-gray-500">
                {hotelForm.location_country === "United States" ? "+1" : "+233"}
              </span>
              <input
                id="settingsfo-contact-phone"
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
            <label htmlFor="settingsfo-city" className="admin-label">City</label>
            <input
              id="settingsfo-city"
              type="text"
              value={hotelForm.location_city}
              onChange={(e) => setHotelForm((f) => ({ ...f, location_city: e.target.value }))}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="settingsfo-contact-email" className="admin-label">Contact Email</label>
            <input
              id="settingsfo-contact-email"
              type="email"
              value={hotelForm.contact_email}
              onChange={(e) => setHotelForm((f) => ({ ...f, contact_email: e.target.value }))}
              className={inputClass}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="settingsfo-check-in-time" className="admin-label">Check-in Time</label>
            <input
              id="settingsfo-check-in-time"
              type="time"
              value={hotelForm.check_in_time}
              onChange={(e) => setHotelForm((f) => ({ ...f, check_in_time: e.target.value }))}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="settingsfo-check-out-time" className="admin-label">Check-out Time</label>
            <input
              id="settingsfo-check-out-time"
              type="time"
              value={hotelForm.check_out_time}
              onChange={(e) => setHotelForm((f) => ({ ...f, check_out_time: e.target.value }))}
              className={inputClass}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="settingsfo-currency" className="admin-label">Currency</label>
            <select
              id="settingsfo-currency"
              value={hotelForm.currency}
              onChange={(e) => setHotelForm((f) => ({ ...f, currency: e.target.value }))}
              className={inputClass}
            >
              <option value="GHS">GHS (Cedi)</option>
              <option value="USD">USD (Dollar)</option>
            </select>
          </div>
          <div>
            <label htmlFor="settingsfo-wi-fi-password" className="admin-label">Wi-Fi Password</label>
            <input
              id="settingsfo-wi-fi-password"
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
            className="admin-btn-primary"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
          <FormStatus message={msg} />
        </div>
      </form>
    </div>
  );
}
