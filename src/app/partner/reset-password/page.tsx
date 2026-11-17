"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AuthShell, BUTTON_PRIMARY, ErrorMessage, INPUT, NETWORK_ERROR, apiError } from "@/components/partner/ui";
import { RESET } from "@/lib/partner/p2-copy";

// Same text as tokenProblemMessage("invalid") (lib/auth/password-reset uses node crypto: server only).
const BAD_LINK = "This link isn't valid. Please ask for a new one.";

const MIN_LENGTH = 8;

function ResetForm() {
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState(token ? "" : BAD_LINK);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < MIN_LENGTH) return setError(`Use at least ${MIN_LENGTH} characters.`);
    if (password !== again) return setError("The two passwords don't match.");
    setLoading(true);
    try {
      const res = await fetch("/api/partner/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (res.ok) setDone(true);
      else setError(await apiError(res, "Something went wrong. Please try again, or ask for a new link."));
    } catch {
      setError(NETWORK_ERROR);
    }
    setLoading(false);
  }

  if (done) {
    return (
      <AuthShell title={RESET.title}>
        <p className="text-sm text-gray-800" role="status">
          {RESET.done}
        </p>
        <Link href="/partner/login" className={`${BUTTON_PRIMARY} w-full mt-5`}>
          Go to sign in
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={RESET.title}
      footer={
        <Link href="/partner/forgot-password" className="text-white underline underline-offset-2">
          {RESET.newLink}
        </Link>
      }
    >
      <form onSubmit={handleSubmit}>
        <label htmlFor="password" className="block text-sm font-medium text-gray-800 mb-2">
          {RESET.newLabel}
        </label>
        <input
          id="password"
          type="password"
          autoComplete="new-password"
          minLength={MIN_LENGTH}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className={`${INPUT} mb-4`}
        />
        <label htmlFor="again" className="block text-sm font-medium text-gray-800 mb-2">
          {RESET.againLabel}
        </label>
        <input
          id="again"
          type="password"
          autoComplete="new-password"
          value={again}
          onChange={(e) => setAgain(e.target.value)}
          required
          className={INPUT}
        />
        <ErrorMessage>{error}</ErrorMessage>
        <button type="submit" disabled={loading || !token} className={`${BUTTON_PRIMARY} w-full mt-5`}>
          {loading ? "Saving…" : RESET.button}
        </button>
      </form>
    </AuthShell>
  );
}

export default function PartnerResetPasswordPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
