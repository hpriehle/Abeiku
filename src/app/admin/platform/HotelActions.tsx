"use client";

import { useRouter } from "next/navigation";
import { apiRequest } from "@/lib/admin/api-client";
import { ErrorNotice, useAdminAction } from "../useAdminAction";

type Act = { action: string; label: string; days?: number };

/** Platform admin buttons for one hotel. Each asks first, then posts to /api/admin/platform/hotels. */
export function HotelActions({ hotelId, hotelName, trialing, exempt, suspended }: {
  hotelId: string;
  hotelName: string;
  trialing: boolean;
  exempt: boolean;
  suspended: boolean;
}) {
  const router = useRouter();
  const { pending, busy, error, setError, run } = useAdminAction();

  const acts: Act[] = [
    ...(trialing ? [7, 14, 30].map((d) => ({ action: "extend_trial", days: d, label: `Trial +${d}d` })) : []),
    exempt ? { action: "unset_exempt", label: "Unset exempt" } : { action: "set_exempt", label: "Set exempt" },
    suspended ? { action: "unsuspend", label: "Unsuspend" } : { action: "suspend", label: "Suspend" },
    { action: "view_as", label: "View as hotel" },
  ];

  async function go(a: Act) {
    if (!window.confirm(`${a.label}: ${hotelName}?`)) return;
    const r = await run(a.label, () =>
      apiRequest<{ audited?: boolean }>("/api/admin/platform/hotels", { method: "POST", json: { hotelId, action: a.action, days: a.days } })
    );
    if (!r?.ok) return;
    if (a.action === "view_as") return window.location.assign("/admin/dashboard");
    if (r.data.audited === false) setError("Done, but the audit row was not written (run docs/go-live-platform-actions.sql).");
    router.refresh();
  }

  return (
    <div className="flex flex-wrap gap-1">
      {acts.map((a) => (
        <button key={a.label} type="button" className="admin-btn-secondary text-xs" disabled={busy} onClick={() => go(a)}>
          {pending === a.label ? "…" : a.label}
        </button>
      ))}
      <ErrorNotice message={error} onDismiss={() => setError(null)} className="w-full mt-1" />
    </div>
  );
}

/** Shown on every admin page while the platform admin views another hotel. */
export function ViewingAsBanner({ hotelName, homeHotelName }: { hotelName: string; homeHotelName: string }) {
  const { busy, error, run } = useAdminAction();
  async function back() {
    const r = await run("back", () => apiRequest("/api/admin/platform/hotels", { method: "POST", json: { action: "view_back" } }));
    if (r?.ok) window.location.assign("/admin/platform");
  }
  return (
    <div role="status" className="bg-purple-100 text-purple-950 px-4 py-2 text-sm flex flex-wrap items-center gap-3">
      <span>
        Viewing as <strong>{hotelName}</strong> (platform admin). Changes here are made for this hotel.
      </span>
      <button type="button" className="admin-btn-secondary text-xs" disabled={busy} onClick={back}>
        Back to {homeHotelName}
      </button>
      {error && <span role="alert">{error}</span>}
    </div>
  );
}
