"use client";

import { useEffect, useState } from "react";

/* ---------- Types ---------- */

interface InternalReview {
  id: string;
  rating: number | null;
  feedback: string | null;
  created_at: string;
  guest_name: string;
  room_slug: string;
  check_in: string;
  check_out: string;
}

interface GoogleReview {
  authorName: string;
  authorPhotoUri: string | null;
  rating: number;
  text: string;
  relativePublishTimeDescription: string;
  publishTime: string;
}

interface GoogleData {
  reviews: GoogleReview[];
  rating: number | null;
  totalCount: number;
}

type MergedReview =
  | { source: "whatsapp"; date: string; data: InternalReview }
  | { source: "google"; date: string; data: GoogleReview };

/* ---------- Helpers ---------- */

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="text-yellow-400 tracking-wider text-sm">
      {"★".repeat(rating)}
      <span className="text-gray-200">{"★".repeat(5 - rating)}</span>
    </span>
  );
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function SourceBadge({ source }: { source: "google" | "whatsapp" }) {
  if (source === "google") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
        Google
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700">
      WhatsApp
    </span>
  );
}

/* ---------- Main Component ---------- */

export function ReviewsList({
  internalReviews,
  hasGooglePlace,
}: {
  internalReviews: InternalReview[];
  hasGooglePlace: boolean;
}) {
  const [googleData, setGoogleData] = useState<GoogleData | null>(null);
  const [googleLoading, setGoogleLoading] = useState(hasGooglePlace);
  const [googleError, setGoogleError] = useState<string | null>(null);

  async function fetchGoogle() {
    if (!hasGooglePlace) return;
    setGoogleLoading(true);
    setGoogleError(null);
    try {
      const res = await fetch("/api/admin/google-reviews");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to fetch Google reviews");
      }
      setGoogleData(await res.json());
    } catch (err) {
      setGoogleError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setGoogleLoading(false);
    }
  }

  useEffect(() => {
    fetchGoogle();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Merge both sources
  const merged: MergedReview[] = [];

  for (const r of internalReviews) {
    merged.push({ source: "whatsapp", date: r.created_at, data: r });
  }
  if (googleData) {
    for (const r of googleData.reviews) {
      merged.push({ source: "google", date: r.publishTime, data: r });
    }
  }

  merged.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          {hasGooglePlace && googleData && (
            <div className="flex items-center gap-3">
              <p className="text-2xl font-bold text-gray-900">
                {googleData.rating ? googleData.rating.toFixed(1) : "—"}{" "}
                <span className="text-yellow-400 text-lg">★</span>
              </p>
              <p className="text-sm text-gray-500">
                {googleData.totalCount.toLocaleString()} reviews on Google
              </p>
            </div>
          )}
          {!hasGooglePlace && (
            <a
              href="/admin/settings/google-reviews"
              className="text-sm text-[#2D4A3E] hover:underline"
            >
              Connect Google to see your public reviews here &rarr;
            </a>
          )}
        </div>
        {hasGooglePlace && (
          <button
            onClick={fetchGoogle}
            disabled={googleLoading}
            className="px-3 py-1.5 border border-gray-300 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {googleLoading ? "Refreshing..." : "Refresh"}
          </button>
        )}
      </div>

      {googleError && (
        <div className="mb-4 px-4 py-2 bg-red-50 border border-red-100 rounded-lg">
          <p className="text-sm text-red-600">{googleError}</p>
        </div>
      )}

      {/* Review list */}
      <div className="space-y-4">
        {merged.map((item, i) =>
          item.source === "google" ? (
            <GoogleCard key={`g-${i}`} review={item.data} />
          ) : (
            <WhatsAppCard key={`w-${item.data.id}`} review={item.data} />
          )
        )}

        {merged.length === 0 && !googleLoading && (
          <div className="bg-white rounded-xl p-12 shadow-sm border border-gray-100 text-center">
            <p className="text-gray-400">No reviews yet.</p>
          </div>
        )}

        {googleLoading && merged.length === 0 && (
          <div className="bg-white rounded-xl p-12 shadow-sm border border-gray-100 text-center">
            <p className="text-gray-400">Loading reviews...</p>
          </div>
        )}
      </div>

      {/* Disclaimer */}
      {googleData && googleData.reviews.length > 0 && (
        <p className="text-xs text-gray-400 mt-4 text-center">
          Showing {googleData.reviews.length} most relevant Google reviews out of{" "}
          {googleData.totalCount.toLocaleString()} total.
        </p>
      )}
    </div>
  );
}

/* ---------- Card Components ---------- */

function GoogleCard({ review }: { review: GoogleReview }) {
  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          {review.authorPhotoUri ? (
            <img
              src={review.authorPhotoUri}
              alt=""
              className="w-8 h-8 rounded-full"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-500">
              {review.authorName.charAt(0)}
            </div>
          )}
          <div>
            <h3 className="font-semibold text-gray-900 text-sm">
              {review.authorName}
            </h3>
            <p className="text-xs text-gray-400">
              {review.relativePublishTimeDescription}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StarRating rating={review.rating} />
          <SourceBadge source="google" />
        </div>
      </div>

      {review.text ? (
        <p className="text-sm text-gray-600 leading-relaxed">{review.text}</p>
      ) : (
        <p className="text-sm text-gray-400 italic">No written review.</p>
      )}
    </div>
  );
}

function WhatsAppCard({ review }: { review: InternalReview }) {
  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-gray-900 text-sm">{review.guest_name}</h3>
          <p className="text-xs text-gray-400">
            {review.room_slug} · {formatDate(review.check_in)} — {formatDate(review.check_out)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {review.rating && <StarRating rating={review.rating} />}
          <SourceBadge source="whatsapp" />
        </div>
      </div>

      {review.feedback ? (
        <p className="text-sm text-gray-600 leading-relaxed">{review.feedback}</p>
      ) : (
        <p className="text-sm text-gray-400 italic">No written feedback.</p>
      )}

      {review.rating && review.rating <= 2 && (
        <div className="mt-3 px-3 py-2 bg-red-50 rounded-lg">
          <p className="text-xs text-red-600 font-medium">Needs attention — low rating</p>
        </div>
      )}
    </div>
  );
}
