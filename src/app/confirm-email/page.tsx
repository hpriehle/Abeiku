"use client";

// Landing page of the "confirm your email" links (sign-up and change of login email). Outside
// /admin so it also works for a hotel that is still in the sign-up steps, or signed out.

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

type State =
  | { kind: "working" }
  | { kind: "done"; text: string }
  | { kind: "error"; text: string };

function Confirm() {
  const token = useSearchParams().get("token") ?? "";
  const started = useRef(false);
  const [state, setState] = useState<State>(
    token ? { kind: "working" } : { kind: "error", text: "This link isn't valid. Sign in and ask for a new one." }
  );

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    (async () => {
      try {
        const res = await fetch("/api/admin/auth/confirm-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          setState({
            kind: "done",
            text:
              data.kind === "change"
                ? `Done. Your login email is now ${data.email}. Use it the next time you sign in.`
                : "Thanks, your email is confirmed.",
          });
        } else {
          setState({ kind: "error", text: data.error || "Something went wrong. Please try again." });
        }
      } catch {
        setState({ kind: "error", text: "Something went wrong. Please check your connection and try again." });
      }
    })();
  }, [token]);

  if (state.kind === "working") return <p className="text-sm text-gray-600">Confirming...</p>;
  return (
    <div>
      <p className={state.kind === "done" ? "admin-success" : "admin-error"} role={state.kind === "done" ? "status" : "alert"}>
        {state.text}
      </p>
      <Link href="/admin" className="admin-btn-primary w-full mt-4 py-3">
        Go to my dashboard
      </Link>
    </div>
  );
}

export default function ConfirmEmailPage() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1a1a2e]" style={{ fontFamily: "var(--font-body), system-ui, sans-serif" }}>
      <div className="w-full max-w-sm mx-4">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white tracking-tight" style={{ fontFamily: "var(--font-heading), Georgia, serif" }}>
            Confirm your email
          </h1>
        </div>
        <div className="bg-white rounded-xl shadow-lg p-8">
          <Suspense fallback={<p className="text-sm text-gray-600">Loading...</p>}>
            <Confirm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
