"use client";

import { useState } from "react";

interface Place {
  id: string;
  displayName: string;
  formattedAddress: string;
  rating: number | null;
  userRatingCount: number | null;
  googleMapsUri: string;
}

interface GoogleReviewsFormProps {
  currentPlaceId: string | null;
  hotelName: string;
  hotelCity: string | null;
}

const inputClass =
  "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#2D4A3E] focus:border-transparent";

export function GoogleReviewsForm({ currentPlaceId, hotelName, hotelCity }: GoogleReviewsFormProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [placeId, setPlaceId] = useState(currentPlaceId);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [showSearch, setShowSearch] = useState(!currentPlaceId);
  const [msg, setMsg] = useState("");

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setMsg("");
    setResults([]);
    try {
      const res = await fetch(`/api/admin/google-places?q=${encodeURIComponent(query.trim())}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Search failed");
      setResults(data.places || []);
      if (data.places?.length === 0) setMsg("No results found. Try a different search.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }

  async function handleSelect(place: Place) {
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/hotel", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ google_place_id: place.id }),
      });
      if (!res.ok) throw new Error("Failed to save");
      setPlaceId(place.id);
      setSelectedPlace(place);
      setShowSearch(false);
      setResults([]);
      setQuery("");
      setMsg("Google Business Profile connected!");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/hotel", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ google_place_id: null }),
      });
      if (!res.ok) throw new Error("Failed to disconnect");
      setPlaceId(null);
      setSelectedPlace(null);
      setShowSearch(true);
      setMsg("");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Failed to disconnect");
    } finally {
      setSaving(false);
    }
  }

  const reviewLink = placeId
    ? `https://search.google.com/local/writereview?placeid=${placeId}`
    : null;

  return (
    <div className="space-y-6">
      {/* Connected state */}
      {placeId && !showSearch && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-3 bg-green-50 border border-green-100 rounded-lg px-4 py-3 mb-4">
            <span className="inline-block w-3 h-3 rounded-full bg-green-500 shrink-0" />
            <div>
              <p className="text-sm font-medium text-green-800">Google Business Profile connected</p>
              <p className="text-xs text-green-600">
                {selectedPlace
                  ? `${selectedPlace.displayName} — ${selectedPlace.formattedAddress}`
                  : `Place ID: ${placeId}`}
              </p>
            </div>
          </div>

          {selectedPlace?.rating && (
            <div className="flex items-center gap-4 mb-4 text-sm text-gray-600">
              <span>
                {"⭐".repeat(Math.round(selectedPlace.rating))} {selectedPlace.rating.toFixed(1)}
              </span>
              {selectedPlace.userRatingCount && (
                <span>{selectedPlace.userRatingCount.toLocaleString()} reviews</span>
              )}
            </div>
          )}

          <div className="mb-4">
            <p className="text-xs font-medium text-gray-500 mb-1">Guest review link</p>
            <a
              href={reviewLink!}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-[#2D4A3E] hover:underline break-all"
            >
              {reviewLink}
            </a>
            <p className="text-xs text-gray-400 mt-1">
              This link will be sent to guests after checkout via WhatsApp.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setShowSearch(true)}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Change
            </button>
            <button
              onClick={handleDisconnect}
              disabled={saving}
              className="px-4 py-2 border border-red-200 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              {saving ? "Removing..." : "Disconnect"}
            </button>
          </div>
        </div>
      )}

      {/* Search state */}
      {showSearch && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <p className="text-sm text-gray-600 mb-4">
            Search for your hotel on Google to connect your Business Profile.
            This enables automatic Google review links for guests after checkout.
          </p>

          <form onSubmit={handleSearch} className="flex gap-2 mb-4">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={hotelCity ? `${hotelName} ${hotelCity}` : hotelName}
              className={inputClass}
            />
            <button
              type="submit"
              disabled={searching || !query.trim()}
              className="px-5 py-2 bg-[#2D4A3E] text-white rounded-lg text-sm font-medium hover:bg-[#1E3329] transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              {searching ? "Searching..." : "Search"}
            </button>
          </form>

          {/* Results */}
          {results.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-500 mb-2">Select your hotel:</p>
              {results.map((place) => (
                <button
                  key={place.id}
                  onClick={() => handleSelect(place)}
                  disabled={saving}
                  className="w-full text-left p-4 border border-gray-200 rounded-lg hover:border-[#2D4A3E] hover:bg-green-50/50 transition-all disabled:opacity-50"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{place.displayName}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{place.formattedAddress}</p>
                    </div>
                    {place.rating && (
                      <div className="text-right shrink-0 ml-4">
                        <p className="text-sm font-medium text-gray-900">
                          ⭐ {place.rating.toFixed(1)}
                        </p>
                        {place.userRatingCount && (
                          <p className="text-xs text-gray-500">
                            {place.userRatingCount.toLocaleString()} reviews
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          {placeId && (
            <button
              onClick={() => setShowSearch(false)}
              className="mt-3 text-sm text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
          )}
        </div>
      )}

      {msg && (
        <p className={`text-sm ${msg.includes("connected") || msg.includes("Connected") ? "text-green-600" : "text-red-600"}`}>
          {msg}
        </p>
      )}

      {/* How it works */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">How it works</h3>
        <ul className="text-sm text-gray-500 space-y-2">
          <li className="flex items-start gap-2">
            <span className="text-green-500 mt-0.5">&#10003;</span>
            After checkout, guests receive a WhatsApp message with a Google review link
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-500 mt-0.5">&#10003;</span>
            One tap opens the Google review form for your hotel
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-500 mt-0.5">&#10003;</span>
            All guests receive the same link — no filtering by rating
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-500 mt-0.5">&#10003;</span>
            Track how many guests click the link from your reviews dashboard
          </li>
        </ul>
      </div>
    </div>
  );
}
