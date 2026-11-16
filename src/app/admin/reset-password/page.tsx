"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

const MIN_LENGTH = 8;

function ResetPasswordForm() {
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [linkBad, setLinkBad] = useState(!token);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < MIN_LENGTH) return setError(`Use at least ${MIN_LENGTH} characters.`);
    if (password !== confirm) return setError("The two passwords don't match.");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setDone(true);
      } else {
        setError(data.error || "Something went wrong. Please try again.");
        if (data.linkProblem) setLinkBad(true);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div>
        <p className="admin-success" role="status">Your password has been changed.</p>
        <Link href="/admin/login" className="admin-btn-primary w-full mt-4 py-3">
          Sign in
        </Link>
      </div>
    );
  }

  if (linkBad) {
    return (
      <div>
        <p className="admin-error" role="alert">{error || "This link isn't valid. Please ask for a new one."}</p>
        <Link href="/admin/forgot-password" className="admin-btn-primary w-full mt-4 py-3">
          Send me a new link
        </Link>
      </div>
    );
  }

  const inputClass = "admin-input px-4 py-3 pr-16 text-gray-900 bg-white";

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="password" className="admin-label mb-2">
        New password
      </label>
      <div className="relative">
        <input
          id="password"
          type={show ? "text" : "password"}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={MIN_LENGTH}
          required
          className={inputClass}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute inset-y-0 right-0 px-3 text-sm font-medium text-[#2D4A3E]"
          aria-label={show ? "Hide password" : "Show password"}
        >
          {show ? "Hide" : "Show"}
        </button>
      </div>
      <p className="admin-hint">At least {MIN_LENGTH} characters.</p>

      <label htmlFor="confirm" className="admin-label mb-2 mt-4">
        Type it again
      </label>
      <input
        id="confirm"
        type={show ? "text" : "password"}
        autoComplete="new-password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        required
        className={inputClass}
      />

      {error && <p className="text-red-600 text-sm mt-2" role="alert">{error}</p>}

      <button type="submit" disabled={loading} className="admin-btn-primary w-full mt-4 py-3">
        {loading ? "Saving..." : "Save new password"}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1a1a2e]" style={{ fontFamily: "var(--font-body), system-ui, sans-serif" }}>
      <div className="w-full max-w-sm mx-4">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white tracking-tight" style={{ fontFamily: "var(--font-heading), Georgia, serif" }}>
            New password
          </h1>
          <p className="text-gray-300 text-sm mt-2">Choose a new password for your dashboard.</p>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-8">
          <Suspense fallback={<p className="text-sm text-gray-600">Loading...</p>}>
            <ResetPasswordForm />
          </Suspense>
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
