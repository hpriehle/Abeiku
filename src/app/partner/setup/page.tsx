"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function PartnerSetupPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!token) {
      setError("Missing invite token. Check your email for the correct link.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/partner/auth/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invite_token: token, password }),
      });

      if (res.ok) {
        router.push("/partner/dashboard");
      } else {
        const data = await res.json();
        setError(data.error || "Could not set password.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#1a1a2e]"
      style={{ fontFamily: "var(--font-body), system-ui, sans-serif" }}
    >
      <div className="w-full max-w-sm mx-4">
        <div className="text-center mb-8">
          <h1
            className="text-3xl font-bold text-white tracking-tight"
            style={{ fontFamily: "var(--font-heading), Georgia, serif" }}
          >
            Set Your Password
          </h1>
          <p className="text-gray-400 text-sm mt-2">Choose a password to activate your account</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-lg p-8">
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
            New password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            required
            minLength={8}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2D4A3E] focus:border-transparent mb-4"
          />

          <label htmlFor="confirm" className="block text-sm font-medium text-gray-700 mb-2">
            Confirm password
          </label>
          <input
            id="confirm"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={8}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2D4A3E] focus:border-transparent"
          />

          {error && <p className="text-red-600 text-sm mt-2">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-4 py-3 bg-[#2D4A3E] text-white rounded-lg text-sm font-medium hover:bg-[#1E3329] transition-colors disabled:opacity-50"
          >
            {loading ? "Setting password..." : "Set password & sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
