"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AuthShell, BUTTON_PRIMARY, ErrorMessage, INPUT, NETWORK_ERROR, apiError } from "@/components/partner/ui";

export default function PartnerLoginPage() {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/partner/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: login, password }),
      });

      if (res.ok) {
        router.replace("/partner/dashboard");
        return; // keep the button in its "Signing in…" state while the dashboard loads
      }
      if (res.status === 401) {
        setError("That email or WhatsApp number and password don't match. Check both and try again.");
      } else if (res.status === 400) {
        setError("Enter your email or WhatsApp number and your password.");
      } else {
        setError(await apiError(res, "Something went wrong on our side. Please try again in a minute."));
      }
    } catch {
      setError(NETWORK_ERROR);
    }
    setLoading(false);
  }

  return (
    <AuthShell
      title="Sign in"
      subtitle="Track your referrals and commission"
      footer={
        <>
          Forgot your password, or never set one?
          <br />
          <span className="text-white">Ask your hotel for a new setup link.</span>
        </>
      }
    >
      <form onSubmit={handleSubmit}>
        <label htmlFor="email" className="block text-sm font-medium text-gray-800 mb-2">
          Email or WhatsApp number
        </label>
        <input
          id="email"
          type="text"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          placeholder="you@example.com or +233…"
          required
          className={`${INPUT} mb-4`}
        />

        <label htmlFor="password" className="block text-sm font-medium text-gray-800 mb-2">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className={INPUT}
        />

        <ErrorMessage>{error}</ErrorMessage>

        <button type="submit" disabled={loading} className={`${BUTTON_PRIMARY} w-full mt-5`}>
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </AuthShell>
  );
}
