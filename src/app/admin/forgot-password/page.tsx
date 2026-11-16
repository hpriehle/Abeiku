"use client";

import { useState } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/auth/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setSent(data.message || "If that email has an account, we've sent a link.");
      else setError(data.error || "Something went wrong. Please try again.");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1a1a2e]" style={{ fontFamily: "var(--font-body), system-ui, sans-serif" }}>
      <div className="w-full max-w-sm mx-4">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white tracking-tight" style={{ fontFamily: "var(--font-heading), Georgia, serif" }}>
            Forgot password?
          </h1>
          <p className="text-gray-300 text-sm mt-2">Enter your email and we&apos;ll send you a link to choose a new one.</p>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-8">
          {sent ? (
            <div>
              <p className="admin-success" role="status">{sent}</p>
              <p className="admin-hint mt-3">The link works for 1 hour. No email? Wait a few minutes, then try again.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <label htmlFor="email" className="admin-label mb-2">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@hotel.com"
                required
                className="admin-input px-4 py-3 text-gray-900 bg-white"
              />

              {error && <p className="text-red-600 text-sm mt-2" role="alert">{error}</p>}

              <button type="submit" disabled={loading} className="admin-btn-primary w-full mt-4 py-3">
                {loading ? "Sending..." : "Send me a link"}
              </button>
            </form>
          )}

          <p className="text-center text-sm mt-6">
            <Link href="/admin/login" className="text-[#2D4A3E] font-medium hover:underline">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
