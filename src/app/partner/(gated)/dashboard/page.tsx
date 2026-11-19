"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDate, formatMoney, nightsLabel, ruleLabel, STATUS_LABEL, STATUS_STYLES } from "@/components/partner/format";
import { copyText } from "@/components/partner/copy";
import { BUTTON_PRIMARY, FONT_HEADING } from "@/components/partner/ui";
import { DASHBOARD, NO_HOTELS, PAYOUT_ADMIN, PAYOUT_PARTNER } from "@/lib/partner/p2-copy";

interface Booking {
  id: string;
  booking_ref: string;
  check_in: string | null;
  check_out: string | null;
  nights: number | null;
  status: string;
  commission: number;
  payout_paid_at: string | null;
}

interface Stats {
  name: string;
  code: string;
  link_url: string | null;
  currency: "GHS" | "USD";
  commission_kind: "percent" | "per_night";
  commission_value: number;
  clicks: number;
  totals: { pending: number; owed: number; paid: number };
  bookings: Booking[];
  /** Payouts this hotel recorded for the partner (P2 step 5), newest first. */
  payouts?: Payout[];
  hotel: Hotel;
  /** Every hotel of the partner's account (P2): a switcher shows when there are 2+. */
  hotels: Hotel[];
}

/** Signed-up account no hotel has added yet (P2 step 2). */
interface NoHotels {
  no_hotels: true;
  name: string;
  hotels: [];
}

interface Payout {
  amount: number;
  currency: "GHS" | "USD";
  paid_on: string;
  method: string;
  reference: string | null;
}

interface Hotel {
  slug: string;
  name: string;
}

const STATUS_HELP: Record<string, string> = {
  pending: "Booked; becomes owed after the guest checks out.",
  owed: "The guest has stayed; your commission is due.",
  paid: "Your commission has been paid.",
  refunded: "Booking refunded; no commission.",
  cancelled: "Booking cancelled; no commission.",
};

const CARD = "bg-white rounded-xl border border-gray-200 shadow-sm";
const LABEL = "text-xs font-semibold text-gray-600 uppercase tracking-wide";

export default function PartnerDashboardPage() {
  const [stats, setStats] = useState<Stats | NoHotels | null>(null);
  const [error, setError] = useState("");
  // Null: the hotel the session opened on.
  const [hotel, setHotel] = useState<string | null>(null);
  // Bumped by "Try again" to re-run the fetch effect.
  const [attempt, setAttempt] = useState(0);
  const router = useRouter();

  useEffect(() => {
    (async () => {
      try {
        const query = hotel ? `?hotel=${encodeURIComponent(hotel)}` : "";
        const r = await fetch(`/api/partner/stats${query}`, { cache: "no-store" });
        if (r.status === 401) {
          router.replace("/partner/login");
          return;
        }
        if (!r.ok) throw new Error(String(r.status));
        setStats(await r.json());
      } catch {
        setError("We couldn't load your bookings. Check your internet connection and try again.");
      }
    })();
  }, [router, hotel, attempt]);

  if (error) {
    return (
      <div className="max-w-5xl mx-auto p-4 sm:p-6 md:p-8">
        <div className={`${CARD} p-6`} role="alert">
          <p className="text-gray-900 font-medium">Something went wrong</p>
          <p className="text-sm text-gray-700 mt-1">{error}</p>
          <button
            onClick={() => {
              setError("");
              setAttempt((a) => a + 1);
            }}
            className={`${BUTTON_PRIMARY} mt-4`}
          >
            Try again
          </button>
        </div>
      </div>
    );
  }
  if (!stats) return <DashboardSkeleton />;
  if ("no_hotels" in stats) {
    return (
      <div className="max-w-5xl mx-auto p-4 sm:p-6 md:p-8 space-y-6">
        <h1 className="text-2xl font-bold text-gray-900 break-words" style={FONT_HEADING}>
          Welcome, {stats.name}
        </h1>
        <section className={`${CARD} p-6`}>
          <p className="text-gray-900 font-medium">{NO_HOTELS.title}</p>
          <p className="text-sm text-gray-700 mt-1 max-w-2xl">{NO_HOTELS.message}</p>
        </section>
      </div>
    );
  }

  const money = (n: number) => formatMoney(n, stats.currency);

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 md:p-8 space-y-6 md:space-y-8">
      {stats.hotels.length > 1 && (
        <HotelSwitcher
          hotels={stats.hotels}
          current={stats.hotel.slug}
          onChange={(slug) => {
            setStats(null);
            setHotel(slug);
          }}
        />
      )}

      <section>
        <h1 className="text-2xl font-bold text-gray-900 break-words" style={FONT_HEADING}>
          Welcome, {stats.name}
        </h1>
        <p className="text-sm text-gray-700 mt-1">
          Your commission: {ruleLabel(stats.commission_kind, stats.commission_value, stats.currency)}.
        </p>
      </section>

      <ReferralLink link={stats.link_url} code={stats.code} />

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4" aria-label="Your commission">
        <Total label="Owed to you" value={money(stats.totals.owed)} hint="Guest has stayed; payment due" highlight />
        <Total label="Pending" value={money(stats.totals.pending)} hint="Guest has not checked out yet" />
        <Total label="Paid" value={money(stats.totals.paid)} hint="Already paid to you" />
        <Total label={DASHBOARD.clicksLabel} value={String(stats.clicks)} hint={DASHBOARD.clicksHint} />
      </section>

      <section className={`${CARD} p-4 sm:p-6`}>
        <h2 className={`${LABEL} mb-4`}>Your bookings</h2>
        {stats.bookings.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-gray-900 font-medium">No bookings yet</p>
            <p className="text-sm text-gray-700 mt-1">
              When a guest books through your link, the booking shows up here with your commission.
            </p>
          </div>
        ) : (
          <>
            {/* Phone: one card per booking */}
            <ul className="sm:hidden divide-y divide-gray-200">
              {stats.bookings.map((b) => (
                <li key={b.id} className="py-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-gray-900">
                      {formatDate(b.check_in)} → {formatDate(b.check_out)}
                    </p>
                    <p className="text-xs text-gray-600 mt-0.5">{nightsLabel(b.nights)}</p>
                    <StatusPill b={b} className="mt-2" />
                  </div>
                  <p className="text-sm font-semibold text-gray-900 whitespace-nowrap">{money(b.commission)}</p>
                </li>
              ))}
            </ul>

            {/* Tablet and desktop: table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wide border-b border-gray-200">
                    <th className="py-2 pr-4">Check-in</th>
                    <th className="py-2 pr-4">Check-out</th>
                    <th className="py-2 pr-4 text-right">Nights</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 text-right">Commission</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.bookings.map((b) => (
                    <tr key={b.id} className="border-b border-gray-100 last:border-0">
                      <td className="py-3 pr-4 text-gray-800">{formatDate(b.check_in)}</td>
                      <td className="py-3 pr-4 text-gray-800">{formatDate(b.check_out)}</td>
                      <td className="py-3 pr-4 text-right text-gray-800">{b.nights ?? "—"}</td>
                      <td className="py-3 pr-4">
                        <StatusPill b={b} />
                      </td>
                      <td className="py-3 text-right font-semibold text-gray-900 whitespace-nowrap">{money(b.commission)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <dl className="mt-4 pt-4 border-t border-gray-200 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs text-gray-700">
              {(["pending", "owed", "paid", "cancelled"] as const).map((s) => (
                <div key={s} className="flex gap-1">
                  <dt className="font-semibold">{STATUS_LABEL[s]}:</dt>
                  <dd>{STATUS_HELP[s]}</dd>
                </div>
              ))}
            </dl>
          </>
        )}
      </section>

      <PayoutList hotel={stats.hotel.name} payouts={stats.payouts ?? []} />
    </div>
  );
}

function PayoutList({ hotel, payouts }: { hotel: string; payouts: Payout[] }) {
  return (
    <section className={`${CARD} p-4 sm:p-6`}>
      <h2 className={`${LABEL} mb-4`}>{PAYOUT_PARTNER.title(hotel)}</h2>
      {payouts.length === 0 ? (
        <p className="py-4 text-center text-sm text-gray-700">{PAYOUT_PARTNER.empty(hotel)}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wide border-b border-gray-200">
                <th className="py-2 pr-4">{PAYOUT_ADMIN.colDate}</th>
                <th className="py-2 pr-4 text-right">{PAYOUT_ADMIN.colAmount}</th>
                <th className="py-2 pr-4">{PAYOUT_ADMIN.colMethod}</th>
                <th className="py-2">{PAYOUT_ADMIN.colReference}</th>
              </tr>
            </thead>
            <tbody>
              {payouts.map((p, i) => (
                <tr key={i} className="border-b border-gray-100 last:border-0">
                  <td className="py-3 pr-4 text-gray-800 whitespace-nowrap">{formatDate(p.paid_on)}</td>
                  <td className="py-3 pr-4 text-right font-semibold text-gray-900 whitespace-nowrap">
                    {formatMoney(p.amount, p.currency)}
                  </td>
                  <td className="py-3 pr-4 text-gray-800">{p.method}</td>
                  <td className="py-3 text-gray-800 break-words">{p.reference ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function HotelSwitcher({
  hotels,
  current,
  onChange,
}: {
  hotels: Hotel[];
  current: string;
  onChange: (slug: string) => void;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
      <label htmlFor="hotel-switcher" className={LABEL}>
        {DASHBOARD.hotelLabel}
      </label>
      <select
        id="hotel-switcher"
        value={current}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-11 px-3 py-2 border border-gray-400 rounded-lg text-base sm:text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#2D4A3E]"
      >
        {hotels.map((h) => (
          <option key={h.slug} value={h.slug}>
            {h.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function ReferralLink({ link, code }: { link: string | null; code: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function handleCopy() {
    if (!link) return;
    const ok = await copyText(link);
    setState(ok ? "copied" : "failed");
    if (ok) setTimeout(() => setState("idle"), 2000);
  }

  return (
    <section className={`${CARD} p-4 sm:p-6`}>
      <h2 className={LABEL}>Your referral link</h2>
      {link ? (
        <>
          <div className="mt-3 flex flex-col sm:flex-row gap-2">
            <input
              readOnly
              value={link}
              aria-label="Your referral link"
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 min-w-0 font-mono text-sm text-gray-900 bg-gray-50 border border-gray-300 rounded-lg px-4 py-3"
            />
            <button onClick={handleCopy} className={`${BUTTON_PRIMARY} sm:w-32`}>
              {state === "copied" ? "Copied ✓" : "Copy link"}
            </button>
          </div>
          <p className="text-xs text-gray-700 mt-2" aria-live="polite">
            {state === "failed"
              ? "Your browser blocked copying. Tap the link, select all, and copy it by hand."
              : "Guests who open this link and book within 30 days are counted as yours."}
          </p>
        </>
      ) : (
        <p className="text-sm text-gray-700 mt-3">
          Your hotel hasn&apos;t set up partner links yet. Until then, ask guests to mention your code when they book.
        </p>
      )}
      <p className="text-xs text-gray-700 mt-2">
        Your code: <span className="font-mono font-semibold text-gray-900">{code}</span>
      </p>
    </section>
  );
}

function StatusPill({ b, className = "" }: { b: Booking; className?: string }) {
  return (
    <span className={`inline-flex flex-wrap items-center gap-x-2 ${className}`}>
      <span
        title={STATUS_HELP[b.status]}
        className={`inline-block px-2 py-0.5 rounded-full border text-xs font-medium ${STATUS_STYLES[b.status] ?? STATUS_STYLES.cancelled}`}
      >
        {STATUS_LABEL[b.status] ?? b.status}
      </span>
      {b.status === "paid" && b.payout_paid_at && (
        <span className="text-xs text-gray-600">on {formatDate(b.payout_paid_at)}</span>
      )}
    </span>
  );
}

function Total({ label, value, hint, highlight = false }: { label: string; value: string; hint: string; highlight?: boolean }) {
  return (
    <div className={`${CARD} p-4 sm:p-5 ${highlight ? "border-[#2D4A3E] ring-1 ring-[#2D4A3E]" : ""}`}>
      <p className={LABEL}>{label}</p>
      <p className="text-2xl md:text-3xl font-bold text-gray-900 mt-1 whitespace-nowrap" style={FONT_HEADING}>
        {value}
      </p>
      <p className="text-xs text-gray-600 mt-1">{hint}</p>
    </div>
  );
}

/** Same layout as the loaded page, so nothing jumps when the data arrives. */
function DashboardSkeleton() {
  const bar = "bg-gray-200 rounded animate-pulse";
  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 md:p-8 space-y-6 md:space-y-8" aria-busy="true" aria-label="Loading your bookings">
      <span className="sr-only">Loading your bookings…</span>
      <div className="space-y-2">
        <div className={`${bar} h-7 w-64 max-w-full`} />
        <div className={`${bar} h-4 w-48`} />
      </div>
      <div className={`${CARD} p-4 sm:p-6 space-y-3`}>
        <div className={`${bar} h-3 w-32`} />
        <div className={`${bar} h-12 w-full`} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`${CARD} p-4 sm:p-5 space-y-2`}>
            <div className={`${bar} h-3 w-20`} />
            <div className={`${bar} h-8 w-32`} />
          </div>
        ))}
      </div>
      <div className={`${CARD} p-4 sm:p-6 h-40`} />
    </div>
  );
}
