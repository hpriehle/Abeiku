"use client";

export function AIMetrics({
  intents,
  avgResponseMs,
  successRate,
  total,
}: {
  intents: { intent: string; count: number }[];
  avgResponseMs: number;
  successRate: number;
  total: number;
}) {
  const maxIntentCount = Math.max(...intents.map((i) => i.count), 1);

  if (total === 0) {
    return (
      <p className="text-sm text-gray-400 text-center py-8">
        No AI interactions yet. Data will appear when guests send free-text messages.
      </p>
    );
  }

  return (
    <div>
      {/* Performance metrics */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-500">Avg Response</p>
          <p className="text-lg font-bold text-gray-900">{avgResponseMs}ms</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-500">Parse Success</p>
          <p className="text-lg font-bold text-gray-900">{successRate}%</p>
        </div>
      </div>

      {/* Intent distribution */}
      <h4 className="text-xs font-medium text-gray-500 mb-3">Intent Distribution</h4>
      <div className="space-y-2">
        {intents.slice(0, 8).map((item) => (
          <div key={item.intent} className="flex items-center gap-2">
            <span className="text-xs text-gray-600 w-24 shrink-0 truncate">{item.intent}</span>
            <div className="flex-1 bg-gray-50 rounded-full h-4 overflow-hidden">
              <div
                className="h-full rounded-full bg-blue-400 transition-all"
                style={{ width: `${(item.count / maxIntentCount) * 100}%` }}
              />
            </div>
            <span className="text-xs text-gray-500 w-8 text-right">{item.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
