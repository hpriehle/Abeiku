"use client";

import { useState } from "react";
import Link from "next/link";
import { apiRequest } from "@/lib/admin/api-client";

/** Shown above every admin page until the login email is confirmed. Never blocks anything. */
export function VerifyEmailBanner({ email }: { email: string }) {
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function resend() {
    if (sending) return;
    setSending(true);
    setNote(null);
    try {
      const r = await apiRequest<{ message?: string; alreadyConfirmed?: boolean }>("/api/admin/account/verify-email", {
        method: "POST",
        fallbackError: "We couldn't send the email. Please try again.",
      });
      if (!r.ok) setNote(r.error);
      else if (r.data.alreadyConfirmed) setNote("Your email is already confirmed. Reload the page.");
      else setNote(r.data.message ?? "Sent. Check your inbox.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 sm:px-6">
      <strong>Check your email.</strong> We sent a link to {email} to confirm it&apos;s yours, so you get booking alerts and
      can reset your password.{" "}
      <button type="button" onClick={resend} disabled={sending} className="font-semibold underline underline-offset-4">
        {sending ? "Sending..." : "Send it again"}
      </button>
      {" · "}
      <Link href="/admin/settings/account" className="font-semibold underline underline-offset-4">
        Wrong email?
      </Link>
      {note && <span className="ml-2" role="status">{note}</span>}
    </div>
  );
}
