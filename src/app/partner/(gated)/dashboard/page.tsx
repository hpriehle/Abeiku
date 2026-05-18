"use client";

import { useEffect, useState } from "react";

interface Stats {
  name: string;
  email: string;
  slug: string;
  link_url: string;
  total_clicks: number;
  clicks_by_day: { date: string; count: number }[];
  recent_clicks: {
    id: string;
    clicked_at: string;
    referer: string | null;
    country: string | null;
    user_agent: string | null;
  }[];
}

export default function PartnerDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/partner/stats")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then(setStats)
      .catch(() => setError("Failed to load stats"))
      .finally(() => setLoading(false));
  }, []);

  async function handleCopy() {
    if (!stats) return;
    await navigator.clipboard.writeText(stats.link_url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return <div className="p-8 text-gray-500">Loading…</div>;
  }
  if (error || !stats) {
    return <div className="p-8 text-red-600">{error || "No data"}</div>;
  }

  const maxDayCount = Math.max(...stats.clicks_by_day.map((d) => d.count), 1);

  return (
    <div className="max-w-5xl mx-auto p-6 md:p-8 space-y-8">
      <section>
        <h2
          className="text-2xl font-bold text-gray-900"
          style={{ fontFamily: "var(--font-heading), Georgia, serif" }}
        >
          Welcome, {stats.name}
        </h2>
        <p className="text-sm text-gray-500 mt-1">Your referral performance at a glance.</p>
      </section>

      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">Your referral link</p>
        <div className="mt-3 flex flex-col sm:flex-row gap-2">
          <div className="flex-1 font-mono text-sm bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 overflow-x-auto">
            {stats.link_url}
          </div>
          <button
            onClick={handleCopy}
            className="px-4 py-3 bg-[#2D4A3E] text-white rounded-lg text-sm font-medium hover:bg-[#1E3329] transition-colors"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">Total clicks</p>
          <p
            className="text-4xl font-bold text-gray-900 mt-2"
            style={{ fontFamily: "var(--font-heading), Georgia, serif" }}
          >
            {stats.total_clicks}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">Last 30 days</p>
          <p
            className="text-4xl font-bold text-gray-900 mt-2"
            style={{ fontFamily: "var(--font-heading), Georgia, serif" }}
          >
            {stats.clicks_by_day.reduce((sum, d) => sum + d.count, 0)}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">Last 7 days</p>
          <p
            className="text-4xl font-bold text-gray-900 mt-2"
            style={{ fontFamily: "var(--font-heading), Georgia, serif" }}
          >
            {stats.clicks_by_day.slice(-7).reduce((sum, d) => sum + d.count, 0)}
          </p>
        </div>
      </section>

      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <p className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-4">
          Clicks per day (30d)
        </p>
        <div className="flex items-end gap-1 h-32">
          {stats.clicks_by_day.map((d) => (
            <div key={d.date} className="flex-1 flex flex-col items-center justify-end" title={`${d.date}: ${d.count}`}>
              <div
                className="w-full bg-[#2D4A3E] rounded-t"
                style={{ height: `${(d.count / maxDayCount) * 100}%`, minHeight: d.count > 0 ? "2px" : "0" }}
              />
            </div>
          ))}
        </div>
        <div className="flex justify-between text-xs text-gray-400 mt-2">
          <span>{stats.clicks_by_day[0]?.date.slice(5)}</span>
          <span>{stats.clicks_by_day[stats.clicks_by_day.length - 1]?.date.slice(5)}</span>
        </div>
      </section>

      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <p className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-4">Recent clicks</p>
        {stats.recent_clicks.length === 0 ? (
          <p className="text-sm text-gray-400">No clicks yet. Share your link to get started.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide border-b border-gray-200">
                <th className="py-2">When</th>
                <th className="py-2">Source</th>
                <th className="py-2 hidden sm:table-cell">Country</th>
              </tr>
            </thead>
            <tbody>
              {stats.recent_clicks.map((c) => (
                <tr key={c.id} className="border-b border-gray-100">
                  <td className="py-2 text-gray-700">{formatTime(c.clicked_at)}</td>
                  <td className="py-2 text-gray-700">{formatReferer(c.referer)}</td>
                  <td className="py-2 text-gray-700 hidden sm:table-cell">{c.country || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatReferer(ref: string | null): string {
  if (!ref) return "Direct";
  try {
    return new URL(ref).hostname;
  } catch {
    return ref.slice(0, 40);
  }
}
