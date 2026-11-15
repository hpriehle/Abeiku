"use client";

import { useState } from "react";
import {
  currencyForCountry,
  defaultRule,
  type CommissionKind,
  type PartnerType,
} from "@/lib/partner/commission";
import type { BookingView, PartnerView } from "@/lib/partner/views";
import { codeFromName } from "@/lib/partner/codes";
import { formatDate, formatMoney, nightsLabel, ruleLabel, STATUS_LABEL, STATUS_STYLES } from "@/components/partner/format";
import { copyText } from "@/components/partner/copy";
import { BUTTON_PRIMARY, BUTTON_SECONDARY, ErrorMessage, FONT_HEADING, NETWORK_ERROR, apiError } from "@/components/partner/ui";

interface AdminData {
  site_url: string | null;
  partners: PartnerView[];
  bookings: BookingView[];
}

interface IssuedLink {
  name: string;
  url: string;
  expiresAt: string;
  reset: boolean;
}

const INPUT =
  "w-full px-3 py-2 min-h-11 border border-gray-500 rounded-lg text-base sm:text-sm text-gray-900 bg-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-[#2D4A3E] focus:border-[#2D4A3E]";
const SMALL_BUTTON = "px-3 py-2 min-h-11 sm:min-h-9 text-sm";
const LINK_BUTTON =
  "text-sm font-medium text-[#2D4A3E] underline underline-offset-2 hover:text-[#1E3329] disabled:opacity-70 py-1";
const CARD = "bg-white rounded-xl border border-gray-200 shadow-sm";
const TH = "px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide";

const TYPE_LABEL: Record<PartnerType, string> = {
  agency: "Agency",
  local: "Local referrer",
  influencer: "Influencer",
};

type Filter = "owed" | "all" | "unknown";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function InfluencersClient({ initial }: { initial: AdminData }) {
  const [data, setData] = useState<AdminData>(initial);
  const [showForm, setShowForm] = useState(false);
  const [issued, setIssued] = useState<IssuedLink | null>(null);
  const [filter, setFilter] = useState<Filter>("owed");
  const [error, setError] = useState("");

  async function refresh() {
    try {
      const res = await fetch("/api/admin/influencers", { cache: "no-store" });
      if (!res.ok) throw new Error();
      setData(await res.json());
    } catch {
      setError("The list could not be refreshed. Reload the page to see the latest data.");
    }
  }

  async function newSetupLink(p: PartnerView) {
    if (
      p.password_set &&
      !confirm(`Make a password reset link for ${p.name}? Their current password keeps working until they use it.`)
    ) {
      return;
    }
    setError("");
    try {
      const res = await fetch(`/api/admin/influencers/${p.id}/setup-link`, { method: "POST" });
      if (!res.ok) {
        setError(await apiError(res, `Could not make a link for ${p.name}. Please try again.`));
        return;
      }
      const body = await res.json();
      setIssued({ name: p.name, url: body.setup_url, expiresAt: body.setup_expires_at, reset: Boolean(body.reset) });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setError(NETWORK_ERROR);
    }
  }

  const owedTotals = sumByCurrency(data.partners, "owed");
  const counts: Record<Filter, number> = {
    owed: data.bookings.filter((b) => b.status === "owed").length,
    all: data.bookings.length,
    unknown: data.bookings.filter((b) => b.partner_id === null).length,
  };
  const visibleBookings = data.bookings.filter((b) =>
    filter === "all" ? true : filter === "owed" ? b.status === "owed" : b.partner_id === null
  );

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900" style={FONT_HEADING}>
            Partners
          </h1>
          <p className="text-sm text-gray-700 mt-1 max-w-2xl">
            Agencies, local referrers and influencers: their bookings and the commission you owe them.
          </p>
          <p className="text-sm text-gray-900 mt-2">
            Owed now: <strong>{owedTotals || formatMoney(0, "GHS")}</strong>
          </p>
        </div>
        <button
          onClick={() => setShowForm((s) => !s)}
          aria-expanded={showForm}
          className={`${showForm ? BUTTON_SECONDARY : BUTTON_PRIMARY} shrink-0`}
        >
          {showForm ? "Cancel" : "+ New partner"}
        </button>
      </div>

      {error && (
        <div
          className="flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3"
          role="alert"
        >
          <p className="text-sm text-red-800">{error}</p>
          <button onClick={() => setError("")} className="text-sm font-medium text-red-800 underline shrink-0">
            Dismiss
          </button>
        </div>
      )}

      {issued && <SetupLinkNotice link={issued} onClose={() => setIssued(null)} />}

      {showForm && (
        <CreatePartnerForm
          siteUrl={data.site_url}
          onCreated={async (link) => {
            setIssued(link);
            setShowForm(false);
            await refresh();
          }}
        />
      )}

      <section className={CARD} aria-labelledby="partners-heading">
        <h2 id="partners-heading" className="px-4 py-3 border-b border-gray-200 text-sm font-semibold text-gray-900">
          {data.partners.length === 1 ? "1 partner" : `${data.partners.length} partners`}
        </h2>
        {data.site_url === null && (
          <p className="px-4 py-3 text-sm text-amber-900 bg-amber-50 border-b border-amber-200">
            This hotel has no partner website set up, so partners have no referral link yet. Ask Abeiku to add your
            site.
          </p>
        )}
        {data.partners.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-gray-900 font-medium">No partners yet</p>
            <p className="text-sm text-gray-700 mt-1">
              Add an agency, local referrer or influencer with “+ New partner”.
            </p>
          </div>
        ) : (
          <>
            <ul className="md:hidden divide-y divide-gray-200">
              {data.partners.map((p) => (
                <li key={p.id} className="p-4 space-y-2">
                  <PartnerIdentity p={p} />
                  <p className="text-sm text-gray-800">{ruleLabel(p.commission_kind, p.commission_value, p.currency)}</p>
                  <dl className="grid grid-cols-3 gap-2 text-sm">
                    <Amount label="Pending" value={formatMoney(p.totals.pending, p.currency)} />
                    <Amount label="Owed" value={formatMoney(p.totals.owed, p.currency)} strong />
                    <Amount label="Paid" value={formatMoney(p.totals.paid, p.currency)} />
                  </dl>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <CopyLinkButton link={p.link} />
                    <AccountCell p={p} onNewLink={newSetupLink} />
                  </div>
                </li>
              ))}
            </ul>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className={`${TH} text-left`}>Partner</th>
                    <th className={`${TH} text-left`}>Code</th>
                    <th className={`${TH} text-left`}>Rule</th>
                    <th className={`${TH} text-right`}>Bookings</th>
                    <th className={`${TH} text-right`}>Pending</th>
                    <th className={`${TH} text-right`}>Owed</th>
                    <th className={`${TH} text-right`}>Paid</th>
                    <th className={`${TH} text-left`}>Account</th>
                  </tr>
                </thead>
                <tbody>
                  {data.partners.map((p) => (
                    <tr key={p.id} className="border-t border-gray-200 align-top">
                      <td className="px-4 py-3 min-w-48">
                        <PartnerIdentity p={p} withCode={false} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-mono text-gray-900">{p.code}</div>
                        <CopyLinkButton link={p.link} />
                      </td>
                      <td className="px-4 py-3 text-gray-800">
                        {ruleLabel(p.commission_kind, p.commission_value, p.currency)}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-800">{p.bookings}</td>
                      <td className="px-4 py-3 text-right text-gray-800 whitespace-nowrap">
                        {formatMoney(p.totals.pending, p.currency)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900 whitespace-nowrap">
                        {formatMoney(p.totals.owed, p.currency)}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-800 whitespace-nowrap">
                        {formatMoney(p.totals.paid, p.currency)}
                      </td>
                      <td className="px-4 py-3">
                        <AccountCell p={p} onNewLink={newSetupLink} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section className={CARD} aria-labelledby="bookings-heading">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 border-b border-gray-200">
          <h2 id="bookings-heading" className="text-sm font-semibold text-gray-900">
            Bookings
          </h2>
          <div className="flex flex-wrap gap-2 text-sm" role="group" aria-label="Show bookings">
            {(["owed", "all", "unknown"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                aria-pressed={filter === f}
                className={`px-3 py-1.5 min-h-9 rounded-full border font-medium transition-colors ${
                  filter === f
                    ? "bg-[#2D4A3E] text-white border-[#2D4A3E]"
                    : "bg-white border-gray-500 text-gray-800 hover:bg-gray-50"
                }`}
              >
                {f === "owed" ? "Owed" : f === "all" ? "All" : "Unknown codes"} ({counts[f]})
              </button>
            ))}
          </div>
        </div>
        {visibleBookings.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-gray-900 font-medium">
              {filter === "owed"
                ? "Nothing owed right now"
                : filter === "unknown"
                  ? "No unknown codes"
                  : "No partner bookings yet"}
            </p>
            <p className="text-sm text-gray-700 mt-1">
              {filter === "owed"
                ? "A booking becomes owed once the guest has checked out."
                : filter === "unknown"
                  ? "Every booking with a ref code matched a partner."
                  : "Bookings made through a partner link show up here."}
            </p>
          </div>
        ) : (
          <>
            <ul className="md:hidden divide-y divide-gray-200">
              {visibleBookings.map((b) => (
                <li key={b.id} className="p-4">
                  <BookingCard b={b} onChange={refresh} onError={setError} />
                </li>
              ))}
            </ul>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className={`${TH} text-left`}>Booking</th>
                    <th className={`${TH} text-left`}>Partner / code</th>
                    <th className={`${TH} text-left`}>Stay</th>
                    <th className={`${TH} text-right`}>Room total</th>
                    <th className={`${TH} text-left`}>Status</th>
                    <th className={`${TH} text-right`}>Commission</th>
                    <th className={`${TH} text-left`}>Payout</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleBookings.map((b) => (
                    <tr key={b.id} className="border-t border-gray-200 align-top">
                      <td className="px-4 py-3 font-mono text-xs text-gray-900">{b.booking_ref}</td>
                      <td className="px-4 py-3">
                        <PartnerName b={b} />
                      </td>
                      <td className="px-4 py-3 text-gray-800">
                        <span className="whitespace-nowrap">{formatDate(b.check_in)}</span> →{" "}
                        <span className="whitespace-nowrap">{formatDate(b.check_out)}</span>
                        <div className="text-xs text-gray-600">{nightsLabel(b.nights)}</div>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-800 whitespace-nowrap">
                        <RoomTotal b={b} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill status={b.status} />
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900 whitespace-nowrap">
                        {b.commission_currency ? formatMoney(b.commission, b.commission_currency) : "—"}
                      </td>
                      <td className="px-4 py-3 min-w-52">
                        <Payout b={b} onChange={refresh} onError={setError} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
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

function PartnerIdentity({ p, withCode = true }: { p: PartnerView; withCode?: boolean }) {
  const details = [TYPE_LABEL[p.partner_type], p.town, p.country, p.whatsapp, p.email].filter(Boolean).join(" · ");
  return (
    <div>
      <div className="font-medium text-gray-900">{p.name}</div>
      {withCode && <div className="font-mono text-sm text-gray-800">{p.code}</div>}
      <div className="text-xs text-gray-600 break-words">{details}</div>
    </div>
  );
}

function Amount({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-gray-600">{label}</dt>
      <dd className={strong ? "font-semibold text-gray-900" : "text-gray-800"}>{value}</dd>
    </div>
  );
}

function CopyLinkButton({ link }: { link: string | null }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  if (!link) return <span className="text-xs text-gray-600">No link (no site set up)</span>;
  return (
    <button
      onClick={async () => {
        const ok = await copyText(link);
        setState(ok ? "copied" : "failed");
        setTimeout(() => setState("idle"), ok ? 2000 : 6000);
      }}
      title={link}
      className={`${LINK_BUTTON} break-all text-left`}
    >
      {state === "copied" ? "Link copied ✓" : state === "failed" ? `Copy failed: ${link}` : "Copy link"}
    </button>
  );
}

function AccountCell({ p, onNewLink }: { p: PartnerView; onNewLink: (p: PartnerView) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    await onNewLink(p);
    setBusy(false);
  };
  return (
    <div className="text-sm">
      {p.password_set ? (
        <span className="text-green-800 font-medium">Active</span>
      ) : (
        <span className="text-amber-900 font-medium">Not set up</span>
      )}
      <span className="text-gray-600"> · </span>
      <button onClick={run} disabled={busy} className={LINK_BUTTON}>
        {busy ? "Making link…" : p.password_set ? "Reset password" : "New setup link"}
      </button>
    </div>
  );
}

function SetupLinkNotice({ link, onClose }: { link: IssuedLink; onClose: () => void }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <div className="rounded-xl bg-green-50 border border-green-300 text-green-950 p-4 text-sm space-y-3" role="status">
      <div className="flex items-start justify-between gap-3">
        <p>
          {link.reset ? "Password reset link" : "Setup link"} for <strong>{link.name}</strong>, valid until{" "}
          <strong>{formatDate(link.expiresAt)}</strong>. No email or message was sent: paste it into your WhatsApp or
          email to them.
        </p>
        <button
          onClick={onClose}
          aria-label="Close"
          className="shrink-0 px-2 text-lg leading-none text-green-900 hover:text-black"
        >
          ✕
        </button>
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          readOnly
          value={link.url}
          aria-label="Setup link"
          onFocus={(e) => e.currentTarget.select()}
          className="flex-1 min-w-0 font-mono text-xs text-gray-900 bg-white border border-green-300 rounded-lg px-3 py-2 min-h-11"
        />
        <button
          onClick={async () => setState((await copyText(link.url)) ? "copied" : "failed")}
          className={`${BUTTON_PRIMARY} ${SMALL_BUTTON} sm:w-28`}
        >
          {state === "copied" ? "Copied ✓" : "Copy"}
        </button>
      </div>
      {state === "failed" && (
        <p className="text-green-950">Copying was blocked by the browser: select the link and copy it by hand.</p>
      )}
    </div>
  );
}

function CreatePartnerForm({
  siteUrl,
  onCreated,
}: {
  siteUrl: string | null;
  onCreated: (link: IssuedLink) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [town, setTown] = useState("");
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
  const previewCode = code || (name.trim() ? codeFromName(name) : "");

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
    if (!email.trim() && !whatsapp.trim()) {
      setError("Give an email or a WhatsApp number, so the partner can sign in.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/admin/influencers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          whatsapp,
          town,
          partner_type: type,
          country,
          code,
          commission_kind: kind,
          commission_value: Number(value),
        }),
      });
      if (!res.ok) {
        setError(await apiError(res, "Could not create the partner. Please try again."));
        return;
      }
      const data = await res.json();
      await onCreated({
        name: `${name} (code ${data.partner.code})`,
        url: data.setup_url,
        expiresAt: data.setup_expires_at,
        reset: false,
      });
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className={`${CARD} p-4 sm:p-6 space-y-4`} aria-label="New partner">
      <h2 className="text-base font-semibold text-gray-900">New partner</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Name" htmlFor="np-name">
          <input id="np-name" value={name} onChange={(e) => setName(e.target.value)} required className={INPUT} />
        </Field>
        <Field label="WhatsApp (with country code)" htmlFor="np-whatsapp">
          <input
            id="np-whatsapp"
            type="tel"
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
            placeholder="+233241234567"
            className={INPUT}
          />
        </Field>
        <Field label="Email (optional if WhatsApp is given)" htmlFor="np-email">
          <input id="np-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={INPUT} />
        </Field>
        <Field label="Town" htmlFor="np-town">
          <input
            id="np-town"
            value={town}
            onChange={(e) => setTown(e.target.value)}
            placeholder="e.g. Cape Coast"
            className={INPUT}
          />
        </Field>
        <Field label="Type" htmlFor="np-type">
          <select
            id="np-type"
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
        <Field label={`Where they are (paid in ${currency === "GHS" ? "GH₵" : "USD"})`} htmlFor="np-where">
          <div className="flex gap-2">
            <select
              id="np-where"
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
                aria-label="Country"
                required
                className={INPUT}
              />
            )}
          </div>
        </Field>
        <Field label="Ref code (optional)" htmlFor="np-code">
          <input
            id="np-code"
            value={code}
            onChange={(e) => setCode(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
            pattern="[a-z0-9\-]{2,40}"
            placeholder={previewCode || "made from the name"}
            className={`${INPUT} font-mono`}
          />
          <p className="text-xs text-gray-700 mt-1 break-all">
            {siteUrl ? (
              <>
                Link: <code>{`${siteUrl.replace(/^https?:\/\//, "")}/?ref=${previewCode || "…"}`}</code>
                {!code && " (-2, -3… is added if the code is taken)"}
              </>
            ) : (
              "No partner website is set up for this hotel yet, so there is no link."
            )}
          </p>
        </Field>
        <Field label="Commission" htmlFor="np-kind">
          <div className="flex gap-2">
            <select
              id="np-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as CommissionKind)}
              className={INPUT}
            >
              <option value="percent">% of room total</option>
              <option value="per_night">{currency === "GHS" ? "GH₵" : "$"} per night</option>
            </select>
            <input
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              required
              aria-label="Commission value"
              placeholder={type === "influencer" ? "agreed rate" : ""}
              className={`${INPUT} w-32`}
            />
          </div>
        </Field>
      </div>

      <ErrorMessage>{error}</ErrorMessage>

      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
        <button type="submit" disabled={loading} className={BUTTON_PRIMARY}>
          {loading ? "Creating…" : "Create partner"}
        </button>
        <p className="text-xs text-gray-700">No email or message is sent. You get a setup link to send yourself.</p>
      </div>
    </form>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-gray-800 mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full border text-xs font-medium ${STATUS_STYLES[status] ?? STATUS_STYLES.cancelled}`}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

function PartnerName({ b }: { b: BookingView }) {
  return (
    <>
      {b.partner_name ? (
        <span className="text-gray-900">{b.partner_name}</span>
      ) : (
        <span className="font-medium text-red-800">Unknown code</span>
      )}
      <div className="text-xs font-mono text-gray-600">{b.ref_code || "—"}</div>
    </>
  );
}

function RoomTotal({ b }: { b: BookingView }) {
  if (b.room_total_usd == null && b.total_ghs == null) return <>—</>;
  return (
    <>
      {b.room_total_usd != null && <div>{formatMoney(b.room_total_usd, "USD")}</div>}
      {b.total_ghs != null && <div className="text-xs text-gray-600">{formatMoney(b.total_ghs, "GHS")}</div>}
    </>
  );
}

function BookingCard({
  b,
  onChange,
  onError,
}: {
  b: BookingView;
  onChange: () => Promise<void>;
  onError: (m: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <PartnerName b={b} />
        </div>
        <div className="text-right">
          <div className="font-semibold text-gray-900 whitespace-nowrap">
            {b.commission_currency ? formatMoney(b.commission, b.commission_currency) : "—"}
          </div>
          <StatusPill status={b.status} />
        </div>
      </div>
      <div className="text-sm text-gray-800">
        {formatDate(b.check_in)} → {formatDate(b.check_out)} · {nightsLabel(b.nights)}
      </div>
      <div className="text-xs text-gray-600">
        <span className="font-mono">{b.booking_ref}</span> · room total{" "}
        {b.room_total_usd != null ? formatMoney(b.room_total_usd, "USD") : "—"}
        {b.total_ghs != null && ` (${formatMoney(b.total_ghs, "GHS")})`}
      </div>
      <Payout b={b} onChange={onChange} onError={onError} />
    </div>
  );
}

function Payout({
  b,
  onChange,
  onError,
}: {
  b: BookingView;
  onChange: () => Promise<void>;
  onError: (m: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(today());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send(body: object): Promise<boolean> {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/influencers/bookings/${b.id}/payout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setError(await apiError(res, "Could not save. Please try again."));
        return false;
      }
      await onChange();
      return true;
    } catch {
      setError(NETWORK_ERROR);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function undo() {
    if (!confirm(`Undo the payout for ${b.booking_ref}? It will show as owed again.`)) return;
    if (!(await send({ paid: false }))) onError(`Could not undo the payout for ${b.booking_ref}. Please try again.`);
  }

  if (b.payout_paid_at) {
    return (
      <div className="text-sm text-gray-800">
        Paid {formatDate(b.payout_paid_at)}
        {b.payout_note && <div className="text-xs text-gray-600 break-words">{b.payout_note}</div>}
        <button disabled={busy} onClick={undo} className={`${LINK_BUTTON} block text-xs`}>
          {busy ? "Undoing…" : "Undo"}
        </button>
      </div>
    );
  }
  if (b.status !== "owed") return <span className="text-sm text-gray-600">—</span>;
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className={`${BUTTON_SECONDARY} ${SMALL_BUTTON}`}>
        Mark paid
      </button>
    );
  }
  return (
    <form
      className="space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await send({ paid: true, paid_at: date, note })) setOpen(false);
      }}
    >
      <label className="block text-xs font-medium text-gray-800">
        Paid on
        <input
          type="date"
          value={date}
          max={today()}
          onChange={(e) => setDate(e.target.value)}
          required
          className={`${INPUT} mt-1`}
        />
      </label>
      <label className="block text-xs font-medium text-gray-800">
        Note (optional)
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. MoMo ref"
          className={`${INPUT} mt-1`}
        />
      </label>
      {error && (
        <p role="alert" className="text-xs text-red-800">
          {error}
        </p>
      )}
      <div className="flex items-center gap-2">
        <button type="submit" disabled={busy} className={`${BUTTON_PRIMARY} ${SMALL_BUTTON}`}>
          {busy ? "Saving…" : "Save payout"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={`${BUTTON_SECONDARY} ${SMALL_BUTTON}`}>
          Cancel
        </button>
      </div>
    </form>
  );
}
