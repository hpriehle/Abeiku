"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  countPlaceholders,
  renderTemplateText,
  type MetaTemplate,
  type TemplateCategory,
} from "@/lib/whatsapp/templates";

const STATUS_STYLES: Record<string, string> = {
  APPROVED: "bg-green-50 text-green-700 border-green-200",
  PENDING: "bg-yellow-50 text-yellow-700 border-yellow-200",
  IN_APPEAL: "bg-yellow-50 text-yellow-700 border-yellow-200",
  REJECTED: "bg-red-50 text-red-700 border-red-200",
  PAUSED: "bg-orange-50 text-orange-700 border-orange-200",
  DISABLED: "bg-gray-100 text-gray-600 border-gray-200",
};

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "en_US", label: "English (US)" },
  { code: "en_GB", label: "English (UK)" },
  { code: "fr", label: "French" },
  { code: "es", label: "Spanish" },
  { code: "pt_BR", label: "Portuguese (BR)" },
];

const input =
  "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2D4A3E]/30 focus:border-[#2D4A3E]";
const label = "block text-xs font-medium text-gray-600 mb-1";
const card = "bg-white rounded-xl shadow-sm border border-gray-100 p-6";
const primaryBtn =
  "px-4 py-2 bg-[#2D4A3E] text-white rounded-lg text-sm font-medium hover:bg-[#1E3329] transition-colors disabled:opacity-50";

async function fetchTemplates(): Promise<[boolean, { templates?: MetaTemplate[]; error?: string }]> {
  const res = await fetch("/api/admin/whatsapp/templates");
  return [res.ok, await res.json().catch(() => ({}))];
}

interface Props {
  displayPhone: string | null;
  hotelName: string;
  initialTo: string;
  initialGuestName: string;
}

export function WhatsAppTemplates({ displayPhone, hotelName, initialTo, initialGuestName }: Props) {
  const [templates, setTemplates] = useState<MetaTemplate[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const apply = useCallback((ok: boolean, data: { templates?: MetaTemplate[]; error?: string }) => {
    setLoadError(ok ? "" : data.error || "Couldn't load templates");
    setTemplates(ok ? (data.templates ?? []) : []);
  }, []);

  const load = useCallback(() => {
    fetchTemplates().then(([ok, data]) => apply(ok, data));
  }, [apply]);

  useEffect(() => {
    let cancelled = false;
    fetchTemplates().then(([ok, data]) => {
      if (!cancelled) apply(ok, data);
    });
    return () => {
      cancelled = true;
    };
  }, [apply]);

  const approved = useMemo(() => (templates ?? []).filter((t) => t.status === "APPROVED"), [templates]);

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500 max-w-2xl">
        WhatsApp only lets a business start a conversation, or message someone more than 24 hours after
        their last message, with a template Meta has approved. Templates send from{" "}
        <span className="font-medium text-gray-700">{displayPhone || hotelName}</span>.
      </p>

      <SendPanel
        approved={approved}
        loading={templates === null}
        initialTo={initialTo}
        initialGuestName={initialGuestName}
      />

      <div className={card}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Your templates</h3>
          <div className="flex gap-2">
            <button onClick={load} className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900">
              Refresh
            </button>
            <button onClick={() => setShowCreate((v) => !v)} className={primaryBtn}>
              {showCreate ? "Close" : "New template"}
            </button>
          </div>
        </div>

        {showCreate && (
          <CreateTemplateForm
            hotelName={hotelName}
            onCreated={() => {
              setShowCreate(false);
              load();
            }}
          />
        )}

        {loadError && <p className="text-sm text-red-600 mb-3">{loadError}</p>}
        {templates === null ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : templates.length === 0 && !loadError ? (
          <p className="text-sm text-gray-500">No templates yet. Create one and Meta will review it, usually within minutes.</p>
        ) : (
          <TemplateList templates={templates} onChanged={load} />
        )}
      </div>
    </div>
  );
}

function TemplateList({ templates, onChanged }: { templates: MetaTemplate[]; onChanged: () => void }) {
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmName, setConfirmName] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function remove(name: string) {
    setDeleting(name);
    setError("");
    const res = await fetch(`/api/admin/whatsapp/templates?name=${encodeURIComponent(name)}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    setDeleting(null);
    setConfirmName(null);
    if (!res.ok) setError(data.error || "Couldn't delete");
    onChanged();
  }

  return (
    <div className="divide-y divide-gray-100">
      {error && <p className="text-sm text-red-600 pb-3">{error}</p>}
      {templates.map((t) => (
        <div key={t.id} className="py-4 flex gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm text-gray-900">{t.name}</span>
              <span className="text-xs text-gray-400">{t.language}</span>
              <span className="text-xs text-gray-400">{t.category.toLowerCase()}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_STYLES[t.status] ?? STATUS_STYLES.DISABLED}`}>
                {t.status.toLowerCase().replace("_", " ")}
              </span>
            </div>
            <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{renderTemplateText(t)}</p>
            {t.rejected_reason && t.rejected_reason !== "NONE" && (
              <p className="text-xs text-red-600 mt-1">Rejected: {t.rejected_reason.toLowerCase().replace(/_/g, " ")}</p>
            )}
          </div>
          <div className="shrink-0">
            {confirmName === t.name ? (
              <div className="flex gap-2 text-sm">
                <button
                  onClick={() => remove(t.name)}
                  disabled={deleting === t.name}
                  className="text-red-600 font-medium disabled:opacity-50"
                >
                  {deleting === t.name ? "Deleting…" : "Delete"}
                </button>
                <button onClick={() => setConfirmName(null)} className="text-gray-500">
                  Cancel
                </button>
              </div>
            ) : (
              <button onClick={() => setConfirmName(t.name)} className="text-sm text-gray-400 hover:text-red-600">
                Delete
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function SendPanel({
  approved,
  loading,
  initialTo,
  initialGuestName,
}: {
  approved: MetaTemplate[];
  loading: boolean;
  initialTo: string;
  initialGuestName: string;
}) {
  const [key, setKey] = useState("");
  const [to, setTo] = useState(initialTo);
  const [guestName, setGuestName] = useState(initialGuestName);
  const [bodyParams, setBodyParams] = useState<string[]>([]);
  const [headerParam, setHeaderParam] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const template = approved.find((t) => `${t.name}:${t.language}` === key);
  const bodyText = template?.components.find((c) => c.type === "BODY")?.text;
  const headerText = template?.components.find((c) => c.type === "HEADER" && c.format === "TEXT")?.text;
  const bodyVars = countPlaceholders(bodyText);
  const headerVars = countPlaceholders(headerText);
  const hasMediaHeader = template?.components.some((c) => c.type === "HEADER" && c.format && c.format !== "TEXT");

  function pick(k: string) {
    setKey(k);
    setBodyParams([]);
    setHeaderParam("");
    setResult(null);
  }

  async function send() {
    if (!template) return;
    setSending(true);
    setResult(null);
    const res = await fetch("/api/admin/whatsapp/send-template", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to,
        guestName,
        name: template.name,
        language: template.language,
        bodyParams: Array.from({ length: bodyVars }, (_, i) => bodyParams[i] ?? ""),
        headerParam: headerVars ? headerParam : undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSending(false);
    if (res.ok) {
      setResult({ ok: true, text: "Sent. Delivery status will show in the inbox thread." });
      setBodyParams([]);
      setHeaderParam("");
    } else {
      setResult({ ok: false, text: data.error || "Failed to send" });
    }
  }

  return (
    <div className={card}>
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Send a template</h3>
      {loading ? (
        <p className="text-sm text-gray-400">Loading templates…</p>
      ) : approved.length === 0 ? (
        <p className="text-sm text-gray-500">No approved templates yet. Create one below; you can send it once Meta approves it.</p>
      ) : (
        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <div>
              <label className={label}>Template</label>
              <select className={input} value={key} onChange={(e) => pick(e.target.value)}>
                <option value="">Choose an approved template…</option>
                {approved.map((t) => (
                  <option key={t.id} value={`${t.name}:${t.language}`}>
                    {t.name} ({t.language})
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={label}>WhatsApp number</label>
                <input className={input} placeholder="+233 24 123 4567" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
              <div>
                <label className={label}>Name (optional)</label>
                <input className={input} placeholder="Ama Mensah" value={guestName} onChange={(e) => setGuestName(e.target.value)} />
              </div>
            </div>
            {headerVars > 0 && (
              <div>
                <label className={label}>Header {"{{1}}"}</label>
                <input className={input} value={headerParam} onChange={(e) => setHeaderParam(e.target.value)} />
              </div>
            )}
            {Array.from({ length: bodyVars }, (_, i) => (
              <div key={i}>
                <label className={label}>Variable {`{{${i + 1}}}`}</label>
                <input
                  className={input}
                  value={bodyParams[i] ?? ""}
                  onChange={(e) => {
                    const next = [...bodyParams];
                    next[i] = e.target.value;
                    setBodyParams(next);
                  }}
                />
              </div>
            ))}
            {hasMediaHeader && (
              <p className="text-xs text-orange-600">This template has an image/video/document header, which this form can&apos;t send yet.</p>
            )}
            <button onClick={send} disabled={!template || !to.trim() || sending || hasMediaHeader} className={primaryBtn}>
              {sending ? "Sending…" : "Send"}
            </button>
            {result && <p className={`text-sm ${result.ok ? "text-green-600" : "text-red-600"}`}>{result.text}</p>}
          </div>
          <div>
            <label className={label}>Preview</label>
            <div className="rounded-xl bg-[#E7F6E7] p-4 min-h-[120px]">
              {template ? (
                <div className="bg-white rounded-lg px-3 py-2 text-sm text-gray-800 shadow-sm whitespace-pre-wrap">
                  {renderTemplateText(template, bodyParams, headerParam || undefined)}
                  {template.components
                    .find((c) => c.type === "BUTTONS")
                    ?.buttons?.map((b, i) => (
                      <div key={i} className="border-t border-gray-100 mt-2 pt-2 text-center text-[#027EB5] font-medium">
                        {b.text}
                      </div>
                    ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400">Pick a template to preview it.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CreateTemplateForm({ hotelName, onCreated }: { hotelName: string; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [language, setLanguage] = useState("en");
  const [category, setCategory] = useState<TemplateCategory>("UTILITY");
  const [headerText, setHeaderText] = useState("");
  const [body, setBody] = useState(`Hi {{1}}, this is ${hotelName}. `);
  const [bodyExamples, setBodyExamples] = useState<string[]>([]);
  const [footer, setFooter] = useState("");
  const [quickReplies, setQuickReplies] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const vars = countPlaceholders(body);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const res = await fetch("/api/admin/whatsapp/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        language,
        category,
        headerText,
        body,
        bodyExamples,
        footer,
        quickReplies: quickReplies.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 3),
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(data.error || "Meta rejected the template");
      return;
    }
    onCreated();
  }

  return (
    <form onSubmit={submit} className="border border-gray-100 rounded-lg p-4 mb-6 bg-gray-50/50 space-y-3">
      <div className="grid md:grid-cols-3 gap-3">
        <div>
          <label className={label}>Name</label>
          <input className={input} placeholder="checkin_reminder" value={name} onChange={(e) => setName(e.target.value)} required />
          <p className="text-[11px] text-gray-400 mt-1">Lowercase and underscores; spaces are converted.</p>
        </div>
        <div>
          <label className={label}>Category</label>
          <select className={input} value={category} onChange={(e) => setCategory(e.target.value as TemplateCategory)}>
            <option value="UTILITY">Utility (bookings, reminders)</option>
            <option value="MARKETING">Marketing (offers, promotions)</option>
          </select>
        </div>
        <div>
          <label className={label}>Language</label>
          <select className={input} value={language} onChange={(e) => setLanguage(e.target.value)}>
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className={label}>Header (optional, max 60 characters)</label>
        <input className={input} maxLength={60} value={headerText} onChange={(e) => setHeaderText(e.target.value)} />
      </div>
      <div>
        <label className={label}>Body: use {"{{1}}"}, {"{{2}}"}… for values you fill in when sending</label>
        <textarea className={`${input} min-h-[100px]`} maxLength={1024} value={body} onChange={(e) => setBody(e.target.value)} required />
      </div>
      {vars > 0 && (
        <div className="grid md:grid-cols-3 gap-3">
          {Array.from({ length: vars }, (_, i) => (
            <div key={i}>
              <label className={label}>Example for {`{{${i + 1}}}`} (Meta requires one)</label>
              <input
                className={input}
                value={bodyExamples[i] ?? ""}
                onChange={(e) => {
                  const next = [...bodyExamples];
                  next[i] = e.target.value;
                  setBodyExamples(next);
                }}
                required
              />
            </div>
          ))}
        </div>
      )}
      <div className="grid md:grid-cols-2 gap-3">
        <div>
          <label className={label}>Footer (optional)</label>
          <input className={input} maxLength={60} value={footer} onChange={(e) => setFooter(e.target.value)} />
        </div>
        <div>
          <label className={label}>Quick reply buttons (optional, comma separated, up to 3)</label>
          <input className={input} placeholder="Yes, No" value={quickReplies} onChange={(e) => setQuickReplies(e.target.value)} />
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={saving} className={primaryBtn}>
        {saving ? "Submitting…" : "Submit for review"}
      </button>
    </form>
  );
}
