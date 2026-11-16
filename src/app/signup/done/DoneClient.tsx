"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/admin/api-client";
import { SignupShell, H1_FONT } from "../SignupShell";

const primary =
  "inline-flex w-full items-center justify-center min-h-12 px-5 rounded-lg bg-[#2D4A3E] text-white text-base font-semibold hover:bg-[#1E3329] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2D4A3E]";

type View = { kind: "working" } | { kind: "ok"; trialEndsAt: string | null } | { kind: "error"; text: string };

/** Back from the Paystack or Stripe card page: finish sign-up and start the trial. */
export function DoneClient() {
  const [view, setView] = useState<View>({ kind: "working" });

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const provider = q.get("provider");
    const json =
      provider === "paystack"
        ? { provider, reference: q.get("reference") ?? q.get("trxref") ?? "" }
        : { provider, sessionId: q.get("session_id") ?? "" };
    apiRequest<{ trialEndsAt: string | null }>("/api/signup/complete", { method: "POST", json }).then((r) =>
      setView(r.ok ? { kind: "ok", trialEndsAt: r.data.trialEndsAt } : { kind: "error", text: r.error })
    );
  }, []);

  return (
    <SignupShell footer={false}>
      {view.kind === "working" && (
        <>
          <h1 className="text-2xl font-bold tracking-tight" style={H1_FONT}>Checking your card...</h1>
          <p className="mt-3 text-base text-gray-700">This takes a few seconds. Please keep this page open.</p>
        </>
      )}
      {view.kind === "ok" && (
        <>
          <h1 className="text-2xl font-bold tracking-tight" style={H1_FONT}>Your free trial has started</h1>
          <p className="mt-3 text-base text-gray-700">
            Your card is saved.
            {view.trialEndsAt &&
              ` The first charge is on ${new Date(view.trialEndsAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}.`}{" "}
            Cancel any time before then on the Plan page and you pay nothing.
          </p>
          <a href="/admin" className={`${primary} mt-6`}>Set up my hotel</a>
        </>
      )}
      {view.kind === "error" && (
        <>
          <h1 className="text-2xl font-bold tracking-tight" style={H1_FONT}>Your card was not added</h1>
          <div role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{view.text}</div>
          <a href="/signup?step=plan" className={`${primary} mt-6`}>Try again</a>
        </>
      )}
    </SignupShell>
  );
}
