"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthShell, BUTTON_PRIMARY, BUTTON_SECONDARY, ErrorMessage, INPUT, NETWORK_ERROR, apiError } from "@/components/partner/ui";
import { INVITE_MESSAGES, type InviteCheck } from "@/lib/partner/invite";
import { HAS_ACCOUNT } from "@/lib/partner/p2-copy";

export default function PartnerSetupPage() {
  // useSearchParams needs a Suspense boundary for the static build.
  return (
    <Suspense fallback={<AuthShell title="Set your password"><Checking /></AuthShell>}>
      <PartnerSetup />
    </Suspense>
  );
}

function Checking() {
  return (
    <p className="text-sm text-gray-700 py-6 text-center" aria-live="polite">
      Checking your link…
    </p>
  );
}

function PartnerSetup() {
  const token = useSearchParams().get("token")?.trim() ?? "";
  // null while checking; a failed check (network) still shows the form, which checks again on submit.
  const [check, setCheck] = useState<InviteCheck | null>(
    token ? null : { valid: false, reason: "missing", message: INVITE_MESSAGES.missing }
  );
  // P2: the link's email already had an account; the hotel was added to it.
  const [hasAccount, setHasAccount] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetch(`/api/partner/auth/invite?token=${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((c: InviteCheck) => !cancelled && setCheck(c))
      .catch(() => !cancelled && setCheck({ valid: true, name: "", reset: false }));
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (!check) {
    return (
      <AuthShell title="Set your password">
        <Checking />
      </AuthShell>
    );
  }

  if (hasAccount) {
    return (
      <AuthShell title={HAS_ACCOUNT.title}>
        <p className="text-sm text-gray-800 leading-relaxed" role="status">
          {HAS_ACCOUNT.message}
        </p>
        <Link href="/partner/login" className={`${BUTTON_PRIMARY} w-full mt-6`}>
          Go to sign in
        </Link>
      </AuthShell>
    );
  }

  if (!check.valid) {
    return (
      <AuthShell
        title={check.reason === "expired" ? "Link expired" : "Link not valid"}
        footer={<>Already set a password? You can sign in.</>}
      >
        <p className="text-sm text-gray-800 leading-relaxed" role="alert">
          {INVITE_MESSAGES[check.reason] ?? INVITE_MESSAGES.invalid}
        </p>
        <Link href="/partner/login" className={`${BUTTON_SECONDARY} w-full mt-6`}>
          Go to sign in
        </Link>
      </AuthShell>
    );
  }

  return (
    <SetupForm
      token={token}
      name={check.name}
      reset={check.reset}
      onInvalid={setCheck}
      onHasAccount={() => setHasAccount(true)}
    />
  );
}

function SetupForm({
  token,
  name,
  reset,
  onInvalid,
  onHasAccount,
}: {
  token: string;
  name: string;
  reset: boolean;
  onInvalid: (c: InviteCheck) => void;
  onHasAccount: () => void;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Your password needs at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("The two passwords are not the same. Type them again.");
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
        router.replace("/partner/dashboard");
        return;
      }
      const body = await res.json().catch(() => null);
      if (body?.reason === "has_account") {
        onHasAccount();
        return;
      }
      if (body?.reason === "expired" || body?.reason === "invalid") {
        onInvalid({ valid: false, reason: body.reason, message: INVITE_MESSAGES[body.reason as "expired" | "invalid"] });
        return;
      }
      setError(
        typeof body?.error === "string" ? body.error : await apiError(res, "Could not set your password. Please try again.")
      );
    } catch {
      setError(NETWORK_ERROR);
    }
    setLoading(false);
  }

  const greeting = name ? `Hi ${name}. ` : "";
  return (
    <AuthShell
      title={reset ? "Choose a new password" : "Set your password"}
      subtitle={`${greeting}${reset ? "Your old password stops working once you save a new one." : "Choose a password to open your partner account."}`}
    >
      <form onSubmit={handleSubmit}>
        <label htmlFor="password" className="block text-sm font-medium text-gray-800 mb-2">
          New password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          aria-describedby="password-hint"
          className={INPUT}
        />
        <p id="password-hint" className="text-xs text-gray-600 mt-1 mb-4">
          At least 8 characters.
        </p>

        <label htmlFor="confirm" className="block text-sm font-medium text-gray-800 mb-2">
          Type it again
        </label>
        <input
          id="confirm"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          minLength={8}
          className={INPUT}
        />

        <ErrorMessage>{error}</ErrorMessage>

        <button type="submit" disabled={loading} className={`${BUTTON_PRIMARY} w-full mt-5`}>
          {loading ? "Saving…" : "Save password and sign in"}
        </button>
      </form>
    </AuthShell>
  );
}
