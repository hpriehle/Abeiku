"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/lib/admin/api-client";
import { ErrorNotice, useAdminAction } from "../useAdminAction";
import { formatPrice, tierForRooms, type BillingCurrency } from "@/lib/billing/plans";

export function PlanActions({
  status,
  roomCount,
  currency,
  trialEndsAt,
}: {
  status: string | null;
  roomCount: number | null;
  currency: BillingCurrency | null;
  trialEndsAt: string | null;
}) {
  const router = useRouter();
  const { pending, busy, error, setError, run } = useAdminAction();
  const [rooms, setRooms] = useState(roomCount ? String(roomCount) : "");
  const [confirming, setConfirming] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  const live = status === "trialing" || status === "active" || status === "past_due";
  const newRooms = Number(rooms);
  const newTier = Number.isInteger(newRooms) && newRooms > 0 ? tierForRooms(newRooms) : null;
  const tierChanges = newTier && roomCount && newTier !== tierForRooms(roomCount);

  async function saveRooms(e: React.FormEvent) {
    e.preventDefault();
    setSaved(null);
    const r = await run("rooms", () => apiRequest("/api/admin/billing/rooms", { method: "POST", json: { rooms: newRooms } }));
    if (r?.ok) {
      setSaved(tierChanges ? "Saved. The new price starts with your next charge." : "Saved.");
      router.refresh();
    }
  }

  async function cancel() {
    const r = await run("cancel", () => apiRequest("/api/admin/billing/cancel", { method: "POST" }));
    if (r?.ok) {
      setConfirming(false);
      router.refresh();
    }
  }

  if (!live) return error ? <ErrorNotice message={error} onDismiss={() => setError(null)} className="mt-4" /> : null;

  return (
    <div className="mt-6 space-y-6">
      {error && <ErrorNotice message={error} onDismiss={() => setError(null)} />}

      <form onSubmit={saveRooms} className="admin-card">
        <h2 className="admin-h2">Number of rooms</h2>
        <p className="mt-1 text-sm text-gray-700">Up to 5 rooms is the small plan. 6 or more is the large plan.</p>
        <label htmlFor="plan-rooms" className="admin-label mt-4">Rooms you rent out</label>
        <div className="flex gap-3">
          <input
            id="plan-rooms"
            type="number"
            inputMode="numeric"
            min={1}
            max={500}
            required
            value={rooms}
            onChange={(e) => setRooms(e.target.value)}
            className="admin-input max-w-32"
          />
          <button type="submit" className="admin-btn-primary" disabled={busy || !newTier || newRooms === roomCount}>
            {pending === "rooms" ? "Saving..." : "Save"}
          </button>
        </div>
        {tierChanges && currency && newTier && (
          <p className="admin-hint text-sm">New price: {formatPrice(newTier, currency)} a month, from your next charge.</p>
        )}
        {saved && <p className="admin-success mt-3">{saved}</p>}
      </form>

      <div className="admin-card">
        <h2 className="admin-h2">Cancel</h2>
        <p className="mt-1 text-sm text-gray-700">
          {status === "trialing"
            ? `You are in your free trial. If you cancel now you pay nothing${trialEndsAt ? `, and you can use Abeiku until ${trialEndsAt}` : ""}.`
            : "No more charges. You can use Abeiku until the end of the month you paid for."}
        </p>
        {!confirming ? (
          <button type="button" className="admin-btn-secondary mt-4" onClick={() => setConfirming(true)} disabled={busy}>
            Cancel my plan
          </button>
        ) : (
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" className="admin-btn-danger" onClick={cancel} disabled={busy}>
              {pending === "cancel" ? "Cancelling..." : "Yes, cancel"}
            </button>
            <button type="button" className="admin-btn-ghost" onClick={() => setConfirming(false)} disabled={busy}>
              Keep my plan
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
