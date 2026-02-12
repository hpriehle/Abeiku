"use client";

import { useEffect, useState } from "react";

interface FunnelData {
  totalRequestsSent: number;
  totalClicks: number;
  clickRate: number;
  latestDelta: {
    preSendCount: number;
    postCheckCount: number;
    delta: number;
    preSendDate: string;
    postCheckDate: string;
  } | null;
}

export function ReviewFunnel() {
  const [data, setData] = useState<FunnelData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/review-funnel")
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6 animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-32 mb-4" />
        <div className="h-8 bg-gray-100 rounded w-full" />
      </div>
    );
  }

  if (!data || (data.totalRequestsSent === 0 && !data.latestDelta)) {
    return null;
  }

  const maxCount = Math.max(data.totalRequestsSent, 1);
  const sentPct = 100;
  const clickPct = Math.max(
    data.totalClicks > 0 ? (data.totalClicks / maxCount) * 100 : 0,
    data.totalClicks > 0 ? 8 : 0,
  );

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
      <h3
        className="text-sm font-semibold text-gray-700 mb-4"
        style={{ fontFamily: "var(--font-heading), Georgia, serif" }}
      >
        Review Link Funnel
      </h3>

      <div className="space-y-3">
        {/* Requests Sent */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-600 w-28 shrink-0 text-right">
            Requests Sent
          </span>
          <div className="flex-1 bg-gray-50 rounded-full h-6 overflow-hidden">
            <div
              className="h-full rounded-full flex items-center justify-end pr-2"
              style={{ width: `${sentPct}%`, backgroundColor: "#3b82f6" }}
            >
              <span className="text-[10px] font-medium text-white">
                {data.totalRequestsSent}
              </span>
            </div>
          </div>
          <span className="text-xs text-gray-400 w-12 shrink-0" />
        </div>

        {/* Link Clicked */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-600 w-28 shrink-0 text-right">
            Link Clicked
          </span>
          <div className="flex-1 bg-gray-50 rounded-full h-6 overflow-hidden">
            <div
              className="h-full rounded-full flex items-center justify-end pr-2"
              style={{ width: `${clickPct}%`, backgroundColor: "#2D4A3E" }}
            >
              {data.totalClicks > 0 && (
                <span className="text-[10px] font-medium text-white">
                  {data.totalClicks}
                </span>
              )}
            </div>
          </div>
          <span className="text-xs text-gray-400 w-12 shrink-0">
            {data.clickRate}%
          </span>
        </div>
      </div>

      {/* Review count delta */}
      {data.latestDelta && data.latestDelta.delta > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-green-50 text-green-700 text-sm font-bold">
              +{data.latestDelta.delta}
            </span>
            <span className="text-sm text-gray-600">
              new Google review{data.latestDelta.delta !== 1 ? "s" : ""} appeared
              after sending review requests
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1 ml-9">
            Google count: {data.latestDelta.preSendCount} → {data.latestDelta.postCheckCount}
          </p>
        </div>
      )}

      {data.latestDelta && data.latestDelta.delta === 0 && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <p className="text-xs text-gray-400">
            No new Google reviews detected since last batch of requests
            (count: {data.latestDelta.postCheckCount})
          </p>
        </div>
      )}
    </div>
  );
}
