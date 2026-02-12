"use client";

const FUNNEL_STEPS = [
  { key: "room_view", label: "Room View" },
  { key: "dates_entered", label: "Dates Entered" },
  { key: "guest_info", label: "Guest Info" },
  { key: "confirmed", label: "Confirmed" },
  { key: "payment_initiated", label: "Payment Started" },
  { key: "booked", label: "Booked" },
];

const COLORS = [
  "#93c5fd", // blue-300
  "#60a5fa", // blue-400
  "#3b82f6", // blue-500
  "#2563eb", // blue-600
  "#1d6b53", // teal
  "#2D4A3E", // brand green
];

export function FunnelChart({ funnel }: { funnel: Record<string, number> }) {
  const maxCount = Math.max(...FUNNEL_STEPS.map((s) => funnel[s.key] ?? 0), 1);

  return (
    <div className="space-y-3">
      {FUNNEL_STEPS.map((step, i) => {
        const count = funnel[step.key] ?? 0;
        const prevCount = i > 0 ? (funnel[FUNNEL_STEPS[i - 1].key] ?? 0) : count;
        const dropOff = prevCount > 0 ? Math.round((count / prevCount) * 100) : 0;
        const widthPct = maxCount > 0 ? (count / maxCount) * 100 : 0;

        return (
          <div key={step.key} className="flex items-center gap-3">
            <span className="text-xs text-gray-600 w-28 shrink-0 text-right">{step.label}</span>
            <div className="flex-1 bg-gray-50 rounded-full h-6 overflow-hidden">
              <div
                className="h-full rounded-full transition-all flex items-center justify-end pr-2"
                style={{
                  width: `${Math.max(widthPct, count > 0 ? 8 : 0)}%`,
                  backgroundColor: COLORS[i],
                }}
              >
                {count > 0 && (
                  <span className="text-[10px] font-medium text-white">{count}</span>
                )}
              </div>
            </div>
            <span className="text-xs text-gray-400 w-12 shrink-0">
              {i > 0 && prevCount > 0 ? `${dropOff}%` : ""}
            </span>
          </div>
        );
      })}

      {maxCount <= 1 && FUNNEL_STEPS.every((s) => (funnel[s.key] ?? 0) === 0) && (
        <p className="text-sm text-gray-400 text-center py-4">
          No funnel data yet. Data will appear as guests interact with your WhatsApp bot.
        </p>
      )}
    </div>
  );
}
