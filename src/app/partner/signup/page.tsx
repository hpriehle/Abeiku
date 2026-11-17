"use client";

import { useState } from "react";
import Link from "next/link";
import { AuthShell, BUTTON_PRIMARY, ErrorMessage, INPUT, NETWORK_ERROR, apiError } from "@/components/partner/ui";
import { SIGNUP } from "@/lib/partner/p2-copy";

// P2 step 2: anyone can create a partner account. Hotels add their partners; this page does not
// list hotels.
export default function PartnerSignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/partner/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, whatsapp, password }),
      });
      if (res.ok) {
        const body = await res.json();
        setSentTo(body.email ?? email);
      } else {
        setError(await apiError(res, "Something went wrong on our side. Please try again in a minute."));
      }
    } catch {
      setError(NETWORK_ERROR);
    }
    setLoading(false);
  }

  if (sentTo) {
    return (
      <AuthShell title={SIGNUP.checkEmailTitle}>
        <p className="text-sm text-gray-800">{SIGNUP.checkEmail(sentTo)}</p>
        <Link href="/partner/login" className={`${BUTTON_PRIMARY} w-full mt-5`}>
          Go to sign in
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={SIGNUP.title}
      subtitle={SIGNUP.subtitle}
      footer={
        <>
          {SIGNUP.haveAccount}{" "}
          <Link href="/partner/login" className="text-white underline underline-offset-2">
            {SIGNUP.signIn}
          </Link>
        </>
      }
    >
      <p className="text-sm text-gray-700 mb-5">{SIGNUP.howItWorks}</p>
      <form onSubmit={handleSubmit}>
        <label htmlFor="name" className="block text-sm font-medium text-gray-800 mb-2">
          {SIGNUP.nameLabel}
        </label>
        <input
          id="name"
          type="text"
          autoComplete="name"
          maxLength={100}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className={`${INPUT} mb-4`}
        />

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
          placeholder="you@example.com"
          required
          className={`${INPUT} mb-4`}
        />

        <label htmlFor="whatsapp" className="block text-sm font-medium text-gray-800 mb-2">
          {SIGNUP.whatsappLabel}
        </label>
        <input
          id="whatsapp"
          type="tel"
          autoComplete="tel"
          value={whatsapp}
          onChange={(e) => setWhatsapp(e.target.value)}
          placeholder={SIGNUP.whatsappPlaceholder}
          required
          className={`${INPUT} mb-4`}
        />

        <label htmlFor="password" className="block text-sm font-medium text-gray-800 mb-2">
          {SIGNUP.passwordLabel}
        </label>
        <input
          id="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-describedby="password-hint"
          required
          className={INPUT}
        />
        <p id="password-hint" className="text-xs text-gray-600 mt-1">
          {SIGNUP.passwordHint}
        </p>

        <ErrorMessage>{error}</ErrorMessage>

        <button type="submit" disabled={loading} className={`${BUTTON_PRIMARY} w-full mt-5`}>
          {loading ? SIGNUP.buttonBusy : SIGNUP.button}
        </button>
      </form>
    </AuthShell>
  );
}
