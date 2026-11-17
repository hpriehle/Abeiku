"use client";

import { useState } from "react";
import Link from "next/link";
import { AuthShell, BUTTON_PRIMARY, ErrorMessage, INPUT, NETWORK_ERROR, apiError } from "@/components/partner/ui";
import { FORGOT, SIGNUP } from "@/lib/partner/p2-copy";

export default function PartnerForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/partner/auth/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.ok) setSent((await res.json()).message);
      else setError(await apiError(res, "Something went wrong on our side. Please try again in a minute."));
    } catch {
      setError(NETWORK_ERROR);
    }
    setLoading(false);
  }

  return (
    <AuthShell
      title={FORGOT.title}
      footer={
        <Link href="/partner/login" className="text-white underline underline-offset-2">
          Go to sign in
        </Link>
      }
    >
      {sent ? (
        <p className="text-sm text-gray-800" role="status">
          {sent}
        </p>
      ) : (
        <form onSubmit={handleSubmit}>
          <p className="text-sm text-gray-700 mb-4">{FORGOT.intro}</p>
          <label htmlFor="email" className="block text-sm font-medium text-gray-800 mb-2">
            {SIGNUP.emailLabel}
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className={INPUT}
          />
          <ErrorMessage>{error}</ErrorMessage>
          <button type="submit" disabled={loading} className={`${BUTTON_PRIMARY} w-full mt-5`}>
            {loading ? FORGOT.buttonBusy : FORGOT.button}
          </button>
          <p className="text-xs text-gray-600 mt-4">{FORGOT.noEmailHint}</p>
        </form>
      )}
    </AuthShell>
  );
}
