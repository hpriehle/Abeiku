"use client";

import { useState } from "react";

interface Row {
  id: string;
  slug: string;
  name: string;
  email: string;
  redirect_url: string;
  password_set: boolean;
  created_at: string;
  last_login_at: string | null;
  total_clicks: number;
}

export function InfluencersClient({ initialRows }: { initialRows: Row[] }) {
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [email, setEmail] = useState("");
  const [redirectUrl, setRedirectUrl] = useState("/");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    setLoading(true);

    try {
      const res = await fetch("/api/admin/influencers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, slug, email, redirect_url: redirectUrl }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to create");
        return;
      }

      setNotice(
        data.email_sent
          ? `Invite sent to ${email}.`
          : `Influencer created, but invite email failed: ${data.email_error ?? "unknown"}.`
      );

      const refreshed = await fetch("/api/admin/influencers").then((r) => r.json());
      setRows(refreshed.influencers ?? []);

      setName("");
      setSlug("");
      setEmail("");
      setRedirectUrl("/");
      setShowForm(false);
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1
            className="text-2xl font-bold text-gray-900"
            style={{ fontFamily: "var(--font-heading), Georgia, serif" }}
          >
            Influencers
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Create referral partners and track their clicks.
          </p>
        </div>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="px-4 py-2 bg-[#2D4A3E] text-white rounded-lg text-sm font-medium hover:bg-[#1E3329] transition-colors"
        >
          {showForm ? "Cancel" : "+ New influencer"}
        </button>
      </div>

      {notice && (
        <div className="mb-4 rounded-lg bg-green-50 border border-green-200 text-green-800 px-4 py-3 text-sm">
          {notice}
        </div>
      )}

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="bg-white rounded-xl border border-gray-200 p-6 mb-6 space-y-4"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2D4A3E]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2D4A3E]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Slug (URL segment)
              </label>
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
                required
                pattern="[a-z0-9\-]{2,40}"
                placeholder="e.g. sophia"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2D4A3E]"
              />
              <p className="text-xs text-gray-500 mt-1">
                Link will be: <code>aracuya.com/{slug || "…"}</code>
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Redirect destination
              </label>
              <input
                type="text"
                value={redirectUrl}
                onChange={(e) => setRedirectUrl(e.target.value)}
                placeholder="/"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2D4A3E]"
              />
            </div>
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-[#2D4A3E] text-white rounded-lg text-sm font-medium hover:bg-[#1E3329] transition-colors disabled:opacity-50"
          >
            {loading ? "Creating…" : "Create & send invite"}
          </button>
        </form>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-6 text-sm text-gray-400">No influencers yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-3">Name</th>
                <th className="text-left px-4 py-3">Slug</th>
                <th className="text-left px-4 py-3">Email</th>
                <th className="text-right px-4 py-3">Clicks</th>
                <th className="text-left px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-gray-100">
                  <td className="px-4 py-3 text-gray-900">{r.name}</td>
                  <td className="px-4 py-3 font-mono text-gray-700">{r.slug}</td>
                  <td className="px-4 py-3 text-gray-700">{r.email}</td>
                  <td className="px-4 py-3 text-right text-gray-900 font-medium">{r.total_clicks}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {r.password_set ? "Active" : "Invite pending"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
