"use client";

import { useState } from "react";
import {
  currencyForCountry,
  defaultRule,
  type CommissionKind,
  type PartnerType,
} from "@/lib/partner/commission";
import type { BookingView, PartnerView } from "@/lib/partner/views";
import { formatDate, formatMoney, ruleLabel, STATUS_STYLES } from "@/components/partner/format";

interface AdminData {
  partners: PartnerView[];
  bookings: BookingView[];
}

const INPUT =
  "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2D4A3E]";
const BUTTON =
  "px-4 py-2 bg-[#2D4A3E] text-white rounded-lg text-sm font-medium hover:bg-[#1E3329] transition-colors disabled:opacity-50";

const TYPE_LABEL: Record<PartnerType, string> = {
  agency: "Agency",
  local: "Local referrer",
  influencer: "Influencer",
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function InfluencersClient({ initial }: { initial: AdminData }) {
  const [data, setData] = useState<AdminData>(initial);
  const [showForm, setShowForm] = useState(false);
  const [setupLink, setSetupLink] = useState<{ name: string; url: string } | null>(null);
  const [filter, setFilter] = useState<"all" | "owed" | "unknown">("owed");

  async function refresh() {
    const res = await fetch("/api/admin/influencers");
    if (res.ok) setData(await res.json());
  }

  async function newSetupLink(p: PartnerView) {
    const res = await fetch(`/api/admin/influencers/${p.id}/setup-link`, { method: "POST" });
    const body = await res.json();
    if (res.ok) setSetupLink({ name: p.name, url: body.setup_url });
    else alert(body.error ?? "Failed");
  }

  const owedTotals = sumByCurrency(data.partners, "owed");
  const visibleBookings = data.bookings.filter((b) =>
    filter === "all" ? true : filter === "owed" ? b.status === "owed" : b.partner_id === null
  );
  const unknownCount = data.bookings.filter((b) => b.partner_id === null).length;

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1
            className="text-2xl font-bold text-gray-900"
            style={{ fontFamily: "var(--font-heading), Georgia, serif" }}
          >
            Partners
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Agencies, local referrers and influencers: their bookings and the commission you owe them.
            {owedTotals && <> Owed now: <strong>{owedTotals}</strong>.</>}
          </p>
        </div>
        <button onClick={() => setShowForm((s) => !s)} className={BUTTON}>
          {showForm ? "Cancel" : "+ New partner"}
        </button>
      </div>

      {setupLink && <SetupLinkNotice {...setupLink} onClose={() => setSetupLink(null)} />}

      {showForm && (
        <CreatePartnerForm
          onCreated={async (name, url) => {
            setSetupLink({ name, url });
            setShowForm(false);
            await refresh();
          }}
        />
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        {data.partners.length === 0 ? (
          <p className="p-6 text-sm text-gray-400">No partners yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-3">Partner</th>
                <th className="text-left px-4 py-3">Code</th>
                <th className="text-left px-4 py-3">Rule</th>
                <th className="text-right px-4 py-3">Bookings</th>
                <th className="text-right px-4 py-3">Pending</th>
                <th className="text-right px-4 py-3">Owed</th>
                <th className="text-right px-4 py-3">Paid</th>
                <th className="text-left px-4 py-3">Account</th>
              </tr>
            </thead>
            <tbody>
              {data.partners.map((p) => (
                <tr key={p.id} className="border-t border-gray-100 align-top">
                  <td className="px-4 py-3">
                    <div className="text-gray-900">{p.name}</div>
                    <div className="text-xs text-gray-500">
                      {TYPE_LABEL[p.partner_type]} · {p.country} · {p.email}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-gray-700">
                    {p.code}
                    <button
                      onClick={() => navigator.clipboard.writeText(p.link)}
                      className="ml-2 text-xs text-[#2D4A3E] underline"
                      title={p.link}
                    >
                      copy link
                    </button>
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {ruleLabel(p.commission_kind, p.commission_value, p.currency)}
                  </td>
                  <td className="px-4 py-3 text-right">{p.bookings}</td>
                  <td className="px-4 py-3 text-right">{formatMoney(p.totals.pending, p.currency)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">
                    {formatMoney(p.totals.owed, p.currency)}
                  </td>
                  <td className="px-4 py-3 text-right">{formatMoney(p.totals.paid, p.currency)}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {p.password_set ? (
                      "Active"
                    ) : (
                      <button onClick={() => newSetupLink(p)} className="text-xs text-[#2D4A3E] underline">
                        Not set up · new setup link
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <p className="text-sm font-medium text-gray-700">Bookings</p>
          <div className="flex gap-1 text-xs">
            {(["owed", "all", "unknown"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded-full border ${filter === f ? "bg-[#2D4A3E] text-white border-[#2D4A3E]" : "border-gray-300 text-gray-600"}`}
              >
                {f === "owed" ? "Owed" : f === "all" ? "All" : `Unknown codes (${unknownCount})`}
              </button>
            ))}
          </div>
        </div>
        {visibleBookings.length === 0 ? (
          <p className="p-6 text-sm text-gray-400">Nothing here.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-3">Booking</th>
                  <th className="text-left px-4 py-3">Partner / code</th>
                  <th className="text-left px-4 py-3">Stay</th>
                  <th className="text-right px-4 py-3">Room total</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-right px-4 py-3">Commission</th>
                  <th className="text-left px-4 py-3">Payout</th>
                </tr>
              </thead>
              <tbody>
                {visibleBookings.map((b) => (
                  <BookingRow key={b.id} b={b} onChange={refresh} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function sumByCurrency(partners: PartnerView[], key: "owed"): string {
  const sums = { GHS: 0, USD: 0 };
  for (const p of partners) sums[p.currency] += p.totals[key];
  return (["GHS", "USD"] as const)
    .filter((c) => sums[c] > 0)
    .map((c) => formatMoney(sums[c], c))
    .join(" + ");
}

function SetupLinkNotice({ name, url, onClose }: { name: string; url: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-lg bg-green-50 border border-green-200 text-green-900 px-4 py-3 text-sm space-y-2">
      <p>
        Setup link for <strong>{name}</strong> (valid 14 days, no email was sent; paste it into your message):
      </p>
      <div className="flex gap-2">
        <code className="flex-1 bg-white border border-green-200 rounded px-3 py-2 break-all">{url}</code>
        <button
          onClick={async () => {
            await navigator.clipboard.writeText(url);
            setCopied(true);
          }}
          className={BUTTON}
        >
          {copied ? "Copied" : "Copy"}
        </button>
        <button onClick={onClose} className="px-3 text-green-800">
          ✕
        </button>
      </div>
    </div>
  );
}

function CreatePartnerForm({ onCreated }: { onCreated: (name: string, url: string) => Promise<void> }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [type, setType] = useState<PartnerType>("agency");
  const [inGhana, setInGhana] = useState(true);
  const [countryName, setCountryName] = useState("");
  const [code, setCode] = useState("");
  const [kind, setKind] = useState<CommissionKind>("percent");
  const [value, setValue] = useState("15");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const country = inGhana ? "Ghana" : countryName.trim();
  const currency = currencyForCountry(inGhana ? "Ghana" : "abroad");

  function applyDefaults(t: PartnerType, ghana: boolean) {
    const rule = defaultRule(t, ghana ? "GHS" : "USD");
    if (rule) {
      setKind(rule.kind);
      setValue(String(rule.value));
    } else {
      setValue("");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/influencers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          partner_type: type,
          country,
          code,
          commission_kind: kind,
          commission_value: Number(value),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create");
        return;
      }
      await onCreated(name, data.setup_url);
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} required className={INPUT} />
        </Field>
        <Field label="Email (used to log in)">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className={INPUT} />
        </Field>
        <Field label="Type">
          <select
            value={type}
            onChange={(e) => {
              const t = e.target.value as PartnerType;
              setType(t);
              applyDefaults(t, inGhana);
            }}
            className={INPUT}
          >
            {(Object.keys(TYPE_LABEL) as PartnerType[]).map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field label={`Where they are (paid in ${currency === "GHS" ? "GH₵" : "USD"})`}>
          <div className="flex gap-2">
            <select
              value={inGhana ? "ghana" : "abroad"}
              onChange={(e) => {
                const g = e.target.value === "ghana";
                setInGhana(g);
                applyDefaults(type, g);
              }}
              className={INPUT}
            >
              <option value="ghana">Ghana</option>
              <option value="abroad">Abroad</option>
            </select>
            {!inGhana && (
              <input
                value={countryName}
                onChange={(e) => setCountryName(e.target.value)}
                placeholder="Country"
                required
                className={INPUT}
              />
            )}
          </div>
        </Field>
        <Field label="Ref code">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
            required
            pattern="[a-z0-9\-]{2,40}"
            placeholder="e.g. kofi-tours"
            className={`${INPUT} font-mono`}
          />
          <p className="text-xs text-gray-500 mt-1">
            Link: <code>aracuya.com/?ref={code || "…"}</code>
          </p>
        </Field>
        <Field label="Commission">
          <div className="flex gap-2">
            <select value={kind} onChange={(e) => setKind(e.target.value as CommissionKind)} className={INPUT}>
              <option value="percent">% of room total</option>
              <option value="per_night">{currency === "GHS" ? "GH₵" : "$"} per night</option>
            </select>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              required
              placeholder={type === "influencer" ? "agreed rate" : ""}
              className={`${INPUT} w-32`}
            />
          </div>
        </Field>
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      <button type="submit" disabled={loading} className={BUTTON}>
        {loading ? "Creating…" : "Create partner (no email is sent)"}
      </button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  );
}

function BookingRow({ b, onChange }: { b: BookingView; onChange: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(today());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const cur = b.commission_currency;

  async function send(body: object) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/influencers/bookings/${b.id}/payout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) alert((await res.json()).error ?? "Failed");
      setOpen(false);
      await onChange();
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr className="border-t border-gray-100 align-top">
      <td className="px-4 py-3 font-mono text-xs text-gray-700">{b.booking_ref}</td>
      <td className="px-4 py-3">
        {b.partner_name ?? <span className="text-red-700">Unknown</span>}
        <div className="text-xs font-mono text-gray-500">{b.ref_code || "—"}</div>
      </td>
      <td className="px-4 py-3 text-gray-700">
        {formatDate(b.check_in)} → {formatDate(b.check_out)}
        <div className="text-xs text-gray-500">{b.nights ?? "?"} nights</div>
      </td>
      <td className="px-4 py-3 text-right text-gray-700">
        {b.room_total_usd != null && <div>{formatMoney(b.room_total_usd, "USD")}</div>}
        {b.total_ghs != null && <div className="text-xs text-gray-500">{formatMoney(b.total_ghs, "GHS")}</div>}
      </td>
      <td className="px-4 py-3">
        <span className={`inline-block px-2 py-0.5 rounded-full border text-xs capitalize ${STATUS_STYLES[b.status] ?? ""}`}>
          {b.status}
        </span>
      </td>
      <td className="px-4 py-3 text-right font-medium">{cur ? formatMoney(b.commission, cur) : "—"}</td>
      <td className="px-4 py-3 text-xs">
        {b.status === "owed" && !open && (
          <button onClick={() => setOpen(true)} className="text-[#2D4A3E] underline">
            Mark paid
          </button>
        )}
        {open && (
          <div className="space-y-1 min-w-48">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={INPUT} />
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Note (e.g. MoMo ref)"
              className={INPUT}
            />
            <div className="flex gap-2">
              <button disabled={busy} onClick={() => send({ paid: true, paid_at: date, note })} className={BUTTON}>
                Save
              </button>
              <button onClick={() => setOpen(false)} className="text-gray-500">
                Cancel
              </button>
            </div>
          </div>
        )}
        {b.payout_paid_at && (
          <div className="text-gray-600">
            Paid {formatDate(b.payout_paid_at)}
            {b.payout_note && <div className="text-gray-500">{b.payout_note}</div>}
            <button
              disabled={busy}
              onClick={() => confirm("Undo this payout?") && send({ paid: false })}
              className="text-gray-400 underline"
            >
              undo
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}
