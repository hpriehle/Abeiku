"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthShell, BUTTON_PRIMARY, BUTTON_SECONDARY, ErrorMessage, INPUT, NETWORK_ERROR, apiError } from "@/components/partner/ui";
import { CONFIRM, FORGOT } from "@/lib/partner/p2-copy";

export default function PartnerLoginPage() {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  /** Signed up but the email is not confirmed yet (P2): offer to send the link again. */
  const [unconfirmed, setUnconfirmed] = useState<string | null>(null);
  const [resent, setResent] = useState("");
  const router = useRouter();

  async function resend() {
    if (!unconfirmed) return;
    setResent("");
    try {
      const res = await fetch("/api/partner/auth/confirm/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: unconfirmed }),
      });
      if (res.ok) setResent((await res.json()).message);
      else setError(await apiError(res, "Something went wrong on our side. Please try again in a minute."));
    } catch {
      setError(NETWORK_ERROR);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setUnconfirmed(null);
    setResent("");
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
      if (res.status === 403) {
        const body = await res.json().catch(() => ({}));
        if (body.reason === "unconfirmed") setUnconfirmed(body.email ?? login);
        setError(body.error ?? CONFIRM.loginUnconfirmed);
      } else if (res.status === 401) {
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
          <Link href="/partner/forgot-password" className="text-white underline underline-offset-2">
            {FORGOT.loginLink}
          </Link>
          <br />
          {FORGOT.noEmailHint}
          <br />
          <br />
          {FORGOT.newHere}{" "}
          <Link href="/partner/signup" className="text-white underline underline-offset-2">
            {FORGOT.createAccount}
          </Link>
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
        {unconfirmed && !resent && (
          <button type="button" onClick={resend} className={`${BUTTON_SECONDARY} w-full mt-3`}>
            {CONFIRM.resendButton}
          </button>
        )}
        {resent && (
          <p role="status" className="mt-3 text-sm text-gray-800">
            {resent}
          </p>
        )}

        <button type="submit" disabled={loading} className={`${BUTTON_PRIMARY} w-full mt-5`}>
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </AuthShell>
  );
}
