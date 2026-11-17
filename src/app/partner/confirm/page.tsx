"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthShell, BUTTON_PRIMARY, ErrorMessage, NETWORK_ERROR, apiError } from "@/components/partner/ui";
import { CONFIRM } from "@/lib/partner/p2-copy";

// The confirm link from the sign-up email. Works once; then signs the partner in.
function ConfirmEmail() {
  const token = useSearchParams().get("token") ?? "";
  const router = useRouter();
  const [error, setError] = useState(token ? "" : CONFIRM.invalid);
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true; // React dev mode runs effects twice; the link works only once
    (async () => {
      try {
        const res = await fetch("/api/partner/auth/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        if (res.ok) {
          router.replace("/partner/dashboard");
          return;
        }
        setError(await apiError(res, CONFIRM.invalid));
      } catch {
        setError(NETWORK_ERROR);
      }
    })();
  }, [token, router]);

  return (
    <AuthShell title={error ? CONFIRM.title : CONFIRM.busy}>
      {error ? (
        <>
          <ErrorMessage>{error}</ErrorMessage>
          <Link href="/partner/login" className={`${BUTTON_PRIMARY} w-full mt-5`}>
            Go to sign in
          </Link>
        </>
      ) : (
        <p className="text-sm text-gray-800" role="status">
          {CONFIRM.busy}
        </p>
      )}
    </AuthShell>
  );
}

export default function PartnerConfirmPage() {
  return (
    <Suspense>
      <ConfirmEmail />
    </Suspense>
  );
}
