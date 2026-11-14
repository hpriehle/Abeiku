"use client";

import { useEffect, useState } from "react";
import { formatDate, formatMoney, ruleLabel, STATUS_STYLES } from "@/components/partner/format";

interface Stats {
  name: string;
  code: string;
  link_url: string;
  currency: "GHS" | "USD";
  commission_kind: "percent" | "per_night";
  commission_value: number;
  totals: { pending: number; owed: number; paid: number };
  bookings: {
    id: string;
    booking_ref: string;
    check_in: string | null;
    check_out: string | null;
    nights: number | null;
    status: string;
    commission: number;
    payout_paid_at: string | null;
  }[];
}

const STATUS_HELP: Record<string, string> = {
  pending: "Booked and paid; becomes owed after the guest checks out.",
  owed: "Guest has stayed; your commission is due.",
  paid: "Commission paid to you.",
  refunded: "Booking refunded; no commission.",
  cancelled: "Booking cancelled; no commission.",
};

export default function PartnerDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/partner/stats")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then(setStats)
      .catch(() => setError("Failed to load your bookings"))
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

  const money = (n: number) => formatMoney(n, stats.currency);

  return (
    <div className="max-w-5xl mx-auto p-6 md:p-8 space-y-8">
      <section>
        <h2
          className="text-2xl font-bold text-gray-900"
          style={{ fontFamily: "var(--font-heading), Georgia, serif" }}
        >
          Welcome, {stats.name}
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Your commission: {ruleLabel(stats.commission_kind, stats.commission_value, stats.currency)}.
        </p>
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
        <p className="text-xs text-gray-500 mt-2">
          Guests who open this link and book within 30 days are counted as yours. Your code: {" "}
          <span className="font-mono">{stats.code}</span>
        </p>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Total label="Pending" value={money(stats.totals.pending)} hint="Guest has not checked out yet" />
        <Total label="Owed to you" value={money(stats.totals.owed)} hint="Guest has stayed, payment due" />
        <Total label="Paid" value={money(stats.totals.paid)} hint="Already paid to you" />
      </section>

      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <p className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-4">Your bookings</p>
        {stats.bookings.length === 0 ? (
          <p className="text-sm text-gray-400">No bookings yet. Share your link to get started.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide border-b border-gray-200">
                  <th className="py-2 pr-4">Check-in</th>
                  <th className="py-2 pr-4">Check-out</th>
                  <th className="py-2 pr-4 text-right">Nights</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 text-right">Commission</th>
                </tr>
              </thead>
              <tbody>
                {stats.bookings.map((b) => (
                  <tr key={b.id} className="border-b border-gray-100">
                    <td className="py-2 pr-4 text-gray-700">{formatDate(b.check_in)}</td>
                    <td className="py-2 pr-4 text-gray-700">{formatDate(b.check_out)}</td>
                    <td className="py-2 pr-4 text-right text-gray-700">{b.nights ?? "—"}</td>
                    <td className="py-2 pr-4">
                      <span
                        title={STATUS_HELP[b.status]}
                        className={`inline-block px-2 py-0.5 rounded-full border text-xs capitalize ${STATUS_STYLES[b.status] ?? ""}`}
                      >
                        {b.status}
                      </span>
                      {b.status === "paid" && b.payout_paid_at && (
                        <span className="ml-2 text-xs text-gray-500">{formatDate(b.payout_paid_at)}</span>
                      )}
                    </td>
                    <td className="py-2 text-right font-medium text-gray-900">{money(b.commission)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Total({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p
        className="text-3xl font-bold text-gray-900 mt-2"
        style={{ fontFamily: "var(--font-heading), Georgia, serif" }}
      >
        {value}
      </p>
      <p className="text-xs text-gray-400 mt-1">{hint}</p>
    </div>
  );
}
