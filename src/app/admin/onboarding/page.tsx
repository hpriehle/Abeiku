"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { COMMON_AMENITIES, BED_TYPES } from "@/lib/constants";
import { MoMoVerificationWizard } from "@/app/admin/settings/momo/MoMoForm";

const MapPicker = dynamic(() => import("./MapPicker"), { ssr: false });

// --- Types ---
interface RoomDraft {
  key: number;
  name: string;
  bed_type: string;
  occupancy: number;
  size: string;
  price: number;
  total_rooms: number;
  amenities: string[];
}

interface IntegrationStatus {
  google_calendar: boolean;
  whatsapp: boolean;
  momo: boolean;
  google_reviews: boolean;
}

interface GooglePlace {
  id: string;
  displayName: string;
  formattedAddress: string;
  rating: number | null;
  userRatingCount: number | null;
}

// --- Main Component ---
export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Step 1 state
  const [contactPhone, setContactPhone] = useState("");
  const [locationCity, setLocationCity] = useState("");
  const [locationCountry, setLocationCountry] = useState("");
  const [locationLat, setLocationLat] = useState<number | null>(null);
  const [locationLng, setLocationLng] = useState<number | null>(null);
  const [checkInTime, setCheckInTime] = useState("14:00");
  const [checkOutTime, setCheckOutTime] = useState("11:00");

  // Step 2 state
  const [rooms, setRooms] = useState<RoomDraft[]>([
    { key: 1, name: "", bed_type: "Queen", occupancy: 2, size: "", price: 0, total_rooms: 1, amenities: [] },
  ]);
  let nextKey = rooms.length > 0 ? Math.max(...rooms.map((r) => r.key)) + 1 : 1;

  // Step 3 state
  const [integrations, setIntegrations] = useState<IntegrationStatus>({
    google_calendar: false,
    whatsapp: false,
    momo: false,
    google_reviews: false,
  });
  const [whatsappToken, setWhatsappToken] = useState("");
  const [whatsappPhoneId, setWhatsappPhoneId] = useState("");
  const [momoVerified, setMomoVerified] = useState(false);

  // Google Reviews state
  const [googleQuery, setGoogleQuery] = useState("");
  const [googleResults, setGoogleResults] = useState<GooglePlace[]>([]);
  const [googleSearching, setGoogleSearching] = useState(false);
  const [googleSaving, setGoogleSaving] = useState(false);

  // Load existing hotel data for pre-population
  useEffect(() => {
    fetch("/api/admin/hotel")
      .then((r) => r.json())
      .then((data) => {
        if (data.hotel) {
          const h = data.hotel;
          if (h.contact_phone) setContactPhone(h.contact_phone);
          if (h.location_city) setLocationCity(h.location_city);
          if (h.location_country) setLocationCountry(h.location_country);
          if (h.location_lat) setLocationLat(h.location_lat);
          if (h.location_lng) setLocationLng(h.location_lng);
          if (h.check_in_time) setCheckInTime(h.check_in_time);
          if (h.check_out_time) setCheckOutTime(h.check_out_time);
        }
        if (data.integrations) {
          setIntegrations(data.integrations);
        }
      })
      .catch(() => {});
  }, []);

  const refreshIntegrations = useCallback(() => {
    fetch("/api/admin/hotel")
      .then((r) => r.json())
      .then((data) => {
        if (data.integrations) setIntegrations(data.integrations);
      })
      .catch(() => {});
  }, []);

  function handleMapClick(lat: number, lng: number) {
    setLocationLat(lat);
    setLocationLng(lng);
  }

  function updateRoom(key: number, field: string, value: unknown) {
    setRooms((prev) =>
      prev.map((r) => (r.key === key ? { ...r, [field]: value } : r))
    );
  }

  function toggleRoomAmenity(key: number, amenity: string) {
    setRooms((prev) =>
      prev.map((r) => {
        if (r.key !== key) return r;
        return {
          ...r,
          amenities: r.amenities.includes(amenity)
            ? r.amenities.filter((a) => a !== amenity)
            : [...r.amenities, amenity],
        };
      })
    );
  }

  function addRoom() {
    setRooms((prev) => [
      ...prev,
      { key: nextKey, name: "", bed_type: "Queen", occupancy: 2, size: "", price: 0, total_rooms: 1, amenities: [] },
    ]);
  }

  function removeRoom(key: number) {
    if (rooms.length <= 1) return;
    setRooms((prev) => prev.filter((r) => r.key !== key));
  }

  // --- Step Handlers ---

  async function handleStep1Next() {
    setError("");
    setSaving(true);
    try {
      const res = await fetch("/api/admin/hotel", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_phone: contactPhone,
          location_city: locationCity,
          location_country: locationCountry,
          location_lat: locationLat,
          location_lng: locationLng,
          check_in_time: checkInTime,
          check_out_time: checkOutTime,
        }),
      });
      if (!res.ok) throw new Error("Failed to save hotel details");
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  async function handleStep2Next() {
    setError("");
    const validRooms = rooms.filter((r) => r.name.trim());
    if (validRooms.length === 0) {
      setError("Please add at least one room type");
      return;
    }

    setSaving(true);
    try {
      for (const room of validRooms) {
        const res = await fetch("/api/admin/rooms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(room),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || `Failed to create room: ${room.name}`);
        }
      }
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  async function saveWhatsApp() {
    setError("");
    setSaving(true);
    try {
      const res = await fetch("/api/admin/hotel", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          whatsapp_access_token: whatsappToken,
          whatsapp_phone_number_id: whatsappPhoneId,
        }),
      });
      if (!res.ok) throw new Error("Failed to save WhatsApp config");
      refreshIntegrations();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  async function searchGooglePlaces() {
    if (!googleQuery.trim()) return;
    setGoogleSearching(true);
    setGoogleResults([]);
    try {
      const res = await fetch(`/api/admin/google-places?q=${encodeURIComponent(googleQuery.trim())}`);
      const data = await res.json();
      if (res.ok) setGoogleResults(data.places || []);
    } catch { /* ignore */ }
    setGoogleSearching(false);
  }

  async function selectGooglePlace(place: GooglePlace) {
    setGoogleSaving(true);
    try {
      const res = await fetch("/api/admin/hotel", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ google_place_id: place.id }),
      });
      if (res.ok) {
        setIntegrations((prev) => ({ ...prev, google_reviews: true }));
        setGoogleResults([]);
        setGoogleQuery("");
      }
    } catch { /* ignore */ }
    setGoogleSaving(false);
  }

  function handleMoMoVerified() {
    setIntegrations((prev) => ({ ...prev, momo: true }));
    setMomoVerified(true);
  }

  function handleComplete() {
    router.push("/admin/dashboard");
  }

  // --- Input helper ---
  const inputClass =
    "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#2D4A3E] focus:border-transparent";

  return (
    <div className="fixed inset-0 z-50 bg-[#1a1a2e] flex items-start justify-center p-4 pt-12 overflow-y-auto" style={{ fontFamily: "system-ui, sans-serif" }}>
      <div className="w-full max-w-2xl">
        {/* Progress */}
        <div className="flex items-center justify-center gap-3 mb-8">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  s === step
                    ? "bg-[#2D4A3E] text-white"
                    : s < step
                      ? "bg-green-500 text-white"
                      : "bg-white/20 text-gray-400"
                }`}
              >
                {s < step ? "✓" : s}
              </div>
              {s < 3 && (
                <div className={`w-16 h-0.5 ${s < step ? "bg-green-500" : "bg-white/20"}`} />
              )}
            </div>
          ))}
        </div>

        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-white">
            {step === 1 && "Hotel Details"}
            {step === 2 && "Room Types"}
            {step === 3 && "Connect Services"}
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            {step === 1 && "Set your location and operating hours"}
            {step === 2 && "Configure your room types and pricing"}
            {step === 3 && "Connect your integrations (you can skip and do this later)"}
          </p>
        </div>

        {/* Step 1: Hotel Details */}
        {step === 1 && (
          <div className="bg-white rounded-xl shadow-lg p-8 space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contact Phone</label>
              <input
                type="tel"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="+233..."
                className={inputClass}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                <input
                  type="text"
                  value={locationCity}
                  onChange={(e) => setLocationCity(e.target.value)}
                  placeholder="Accra"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                <input
                  type="text"
                  value={locationCountry}
                  onChange={(e) => setLocationCountry(e.target.value)}
                  placeholder="Ghana"
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Pin Your Location
                {locationLat && locationLng && (
                  <span className="text-xs text-gray-400 ml-2">
                    ({locationLat.toFixed(4)}, {locationLng.toFixed(4)})
                  </span>
                )}
              </label>
              <div className="rounded-lg overflow-hidden border border-gray-300" style={{ height: 300 }}>
                <MapPicker
                  lat={locationLat ?? 5.6037}
                  lng={locationLng ?? -0.187}
                  onClick={handleMapClick}
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">Click on the map to set your hotel location</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Check-in Time</label>
                <input
                  type="time"
                  value={checkInTime}
                  onChange={(e) => setCheckInTime(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Check-out Time</label>
                <input
                  type="time"
                  value={checkOutTime}
                  onChange={(e) => setCheckOutTime(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            {error && <p className="text-red-600 text-sm">{error}</p>}

            <button
              onClick={handleStep1Next}
              disabled={saving}
              className="w-full py-3 bg-[#2D4A3E] text-white rounded-lg text-sm font-medium hover:bg-[#1E3329] transition-colors disabled:opacity-50"
            >
              {saving ? "Saving..." : "Next: Room Types"}
            </button>
          </div>
        )}

        {/* Step 2: Room Types */}
        {step === 2 && (
          <div className="space-y-4">
            {rooms.map((room, index) => (
              <div key={room.key} className="bg-white rounded-xl shadow-lg p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-900">Room Type {index + 1}</h3>
                  {rooms.length > 1 && (
                    <button
                      onClick={() => removeRoom(room.key)}
                      className="text-sm text-red-500 hover:underline"
                    >
                      Remove
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Room Name</label>
                    <input
                      type="text"
                      value={room.name}
                      onChange={(e) => updateRoom(room.key, "name", e.target.value)}
                      placeholder="Standard Room"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Bed Type</label>
                    <select
                      value={room.bed_type}
                      onChange={(e) => updateRoom(room.key, "bed_type", e.target.value)}
                      className={inputClass}
                    >
                      {BED_TYPES.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Max Guests</label>
                    <input
                      type="number"
                      min={1}
                      value={room.occupancy}
                      onChange={(e) => updateRoom(room.key, "occupancy", Number(e.target.value))}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Size</label>
                    <input
                      type="text"
                      value={room.size}
                      onChange={(e) => updateRoom(room.key, "size", e.target.value)}
                      placeholder="45 m2"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Price/Night</label>
                    <input
                      type="number"
                      min={0}
                      value={room.price}
                      onChange={(e) => updateRoom(room.key, "price", Number(e.target.value))}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">How Many?</label>
                    <input
                      type="number"
                      min={1}
                      value={room.total_rooms}
                      onChange={(e) => updateRoom(room.key, "total_rooms", Number(e.target.value))}
                      className={inputClass}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-2">Amenities</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {COMMON_AMENITIES.map((amenity) => (
                      <label key={amenity} className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={room.amenities.includes(amenity)}
                          onChange={() => toggleRoomAmenity(room.key, amenity)}
                          className="rounded border-gray-300 text-[#2D4A3E] focus:ring-[#2D4A3E]"
                        />
                        {amenity}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            ))}

            <button
              onClick={addRoom}
              className="w-full py-3 border-2 border-dashed border-white/30 text-white/70 rounded-xl text-sm font-medium hover:border-white/50 hover:text-white transition-colors"
            >
              + Add Another Room Type
            </button>

            {error && (
              <div className="bg-white rounded-xl p-4">
                <p className="text-red-600 text-sm">{error}</p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setStep(1)}
                className="flex-1 py-3 border border-white/30 text-white rounded-lg text-sm font-medium hover:bg-white/10 transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleStep2Next}
                disabled={saving}
                className="flex-1 py-3 bg-[#2D4A3E] text-white rounded-lg text-sm font-medium hover:bg-[#1E3329] transition-colors disabled:opacity-50"
              >
                {saving ? "Saving..." : "Next: Connect Services"}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Connect Services */}
        {step === 3 && (
          <div className="space-y-4">
            {/* Google Calendar */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">📅</span>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">Google Calendar</h3>
                    <p className="text-xs text-gray-500">Sync bookings with your calendar</p>
                  </div>
                </div>
                {integrations.google_calendar ? (
                  <span className="px-2.5 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">Connected</span>
                ) : (
                  <span className="px-2.5 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium">Not connected</span>
                )}
              </div>
              {!integrations.google_calendar && (
                <div className="flex gap-2">
                  <a
                    href="/api/auth/google"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-[#2D4A3E] text-white rounded-lg text-sm font-medium hover:bg-[#1E3329] transition-colors"
                  >
                    Connect Google Calendar
                  </a>
                  <button
                    onClick={refreshIntegrations}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 transition-colors"
                  >
                    Refresh Status
                  </button>
                </div>
              )}
            </div>

            {/* WhatsApp */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">💬</span>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">WhatsApp Cloud API</h3>
                    <p className="text-xs text-gray-500">Enable WhatsApp booking assistant</p>
                  </div>
                </div>
                {integrations.whatsapp ? (
                  <span className="px-2.5 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">Connected</span>
                ) : (
                  <span className="px-2.5 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium">Not configured</span>
                )}
              </div>
              {!integrations.whatsapp && (
                <div className="space-y-3">
                  <input
                    type="text"
                    value={whatsappToken}
                    onChange={(e) => setWhatsappToken(e.target.value)}
                    placeholder="Access Token"
                    className={inputClass}
                  />
                  <input
                    type="text"
                    value={whatsappPhoneId}
                    onChange={(e) => setWhatsappPhoneId(e.target.value)}
                    placeholder="Phone Number ID"
                    className={inputClass}
                  />
                  <button
                    onClick={saveWhatsApp}
                    disabled={saving || !whatsappToken || !whatsappPhoneId}
                    className="px-4 py-2 bg-[#2D4A3E] text-white rounded-lg text-sm font-medium hover:bg-[#1E3329] transition-colors disabled:opacity-50"
                  >
                    {saving ? "Saving..." : "Save"}
                  </button>
                </div>
              )}
            </div>

            {/* MTN Mobile Money */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              {momoVerified || integrations.momo ? (
                <div className="flex items-center gap-3">
                  <span className="text-2xl">💰</span>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">MTN Mobile Money</h3>
                    <span className="px-2.5 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">Verified</span>
                  </div>
                </div>
              ) : (
                <MoMoVerificationWizard
                  initialPhone={null}
                  isVerified={false}
                  hasPendingVerification={false}
                  verificationSentAt={null}
                  currency="GHS"
                  feeLabel={null}
                  onVerified={handleMoMoVerified}
                />
              )}
            </div>

            {/* Card Payments (Paystack) */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">💳</span>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">Card Payments</h3>
                    <p className="text-xs text-gray-500">Accept card payments from guests</p>
                  </div>
                </div>
              </div>
              <p className="text-xs text-gray-500 mb-3">
                Connect your bank account so guests can pay by card. You can set this up now or later in Settings.
              </p>
              <a
                href="/admin/settings/paystack"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block px-4 py-2 bg-[#2D4A3E] text-white rounded-lg text-sm font-medium hover:bg-[#1E3329] transition-colors"
              >
                Set Up Card Payments
              </a>
            </div>

            {/* Google Reviews */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">⭐</span>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">Google Reviews</h3>
                    <p className="text-xs text-gray-500">Help guests find you on Google</p>
                  </div>
                </div>
                {integrations.google_reviews ? (
                  <span className="px-2.5 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">Connected</span>
                ) : (
                  <span className="px-2.5 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium">Not configured</span>
                )}
              </div>
              {!integrations.google_reviews && (
                <div className="space-y-3">
                  <p className="text-xs text-gray-500">Search for your hotel to connect your Google Business Profile. Guests will receive a review link after checkout.</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={googleQuery}
                      onChange={(e) => setGoogleQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), searchGooglePlaces())}
                      placeholder="Search your hotel name..."
                      className={inputClass}
                    />
                    <button
                      onClick={searchGooglePlaces}
                      disabled={googleSearching || !googleQuery.trim()}
                      className="px-4 py-2 bg-[#2D4A3E] text-white rounded-lg text-sm font-medium hover:bg-[#1E3329] transition-colors disabled:opacity-50 whitespace-nowrap"
                    >
                      {googleSearching ? "..." : "Search"}
                    </button>
                  </div>
                  {googleResults.length > 0 && (
                    <div className="space-y-1.5">
                      {googleResults.map((place) => (
                        <button
                          key={place.id}
                          onClick={() => selectGooglePlace(place)}
                          disabled={googleSaving}
                          className="w-full text-left p-3 border border-gray-200 rounded-lg hover:border-[#2D4A3E] hover:bg-green-50/50 transition-all disabled:opacity-50"
                        >
                          <p className="text-sm font-medium text-gray-900">{place.displayName}</p>
                          <p className="text-xs text-gray-500">{place.formattedAddress}</p>
                          {place.rating && (
                            <p className="text-xs text-gray-400 mt-0.5">
                              ⭐ {place.rating.toFixed(1)} ({place.userRatingCount?.toLocaleString()} reviews)
                            </p>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {error && (
              <div className="bg-white rounded-xl p-4">
                <p className="text-red-600 text-sm">{error}</p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setStep(2)}
                className="flex-1 py-3 border border-white/30 text-white rounded-lg text-sm font-medium hover:bg-white/10 transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleComplete}
                className="flex-1 py-3 bg-[#2D4A3E] text-white rounded-lg text-sm font-medium hover:bg-[#1E3329] transition-colors"
              >
                Complete Setup
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
