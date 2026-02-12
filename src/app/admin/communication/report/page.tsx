import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/admin/auth";
import { getChatStats } from "@/lib/db";
import { FunnelChart } from "./FunnelChart";
import { AIMetrics } from "./AIMetrics";

const PERIODS = [
  { value: "24h", label: "24h" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
];

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/admin/login");

  const params = await searchParams;
  const period = params.period ?? "7d";

  let stats: Awaited<ReturnType<typeof getChatStats>>;
  try {
    stats = await getChatStats(session.hotelId, period);
  } catch {
    // Migration may not have been run yet — show empty stats
    stats = {
      totalMessages: 0, inboundMessages: 0, outboundMessages: 0,
      activeConversations: 0, aiSuccessRate: 100, aiTotal: 0,
      conversionRate: 0, leadsCount: 0, bookedCount: 0,
      funnel: { lead: 0, room_view: 0, dates_entered: 0, guest_info: 0, confirmed: 0, payment_initiated: 0, booked: 0 },
      aiIntents: [], aiAvgResponseMs: 0, messagesPerDay: [],
    };
  }

  return (
    <>
      {/* Time range selector */}
      <div className="flex gap-2 mb-6">
        {PERIODS.map((p) => (
          <Link
            key={p.value}
            href={`/admin/communication/report?period=${p.value}`}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              period === p.value
                ? "bg-[#2D4A3E] text-white"
                : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
            }`}
          >
            {p.label}
          </Link>
        ))}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          icon="💬"
          label="Total Messages"
          value={stats.totalMessages.toLocaleString()}
          sub={`${stats.inboundMessages} inbound, ${stats.outboundMessages} outbound`}
        />
        <StatCard
          icon="👥"
          label="Active Conversations"
          value={stats.activeConversations.toLocaleString()}
          sub={`in last ${period}`}
        />
        <StatCard
          icon="🤖"
          label="AI Success Rate"
          value={`${stats.aiSuccessRate}%`}
          sub={`${stats.aiTotal} messages parsed`}
        />
        <StatCard
          icon="📈"
          label="Conversion Rate"
          value={`${stats.conversionRate}%`}
          sub={`${stats.bookedCount} bookings from ${stats.leadsCount} leads`}
        />
      </div>

      {/* Funnel + AI metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Conversion Funnel</h3>
          <FunnelChart funnel={stats.funnel} />
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">AI Effectiveness</h3>
          <AIMetrics
            intents={stats.aiIntents}
            avgResponseMs={stats.aiAvgResponseMs}
            successRate={stats.aiSuccessRate}
            total={stats.aiTotal}
          />
        </div>
      </div>

      {/* Messages over time */}
      {stats.messagesPerDay.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Messages Over Time</h3>
          <div className="space-y-2">
            {stats.messagesPerDay.map((day) => {
              const maxMsg = Math.max(...stats.messagesPerDay.map((d) => d.inbound + d.outbound), 1);
              const total = day.inbound + day.outbound;
              const pct = (total / maxMsg) * 100;

              return (
                <div key={day.date} className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-20 shrink-0">
                    {new Date(day.date + "T00:00:00").toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                  <div className="flex-1 flex h-5 rounded-full overflow-hidden bg-gray-50">
                    <div
                      className="bg-blue-400 transition-all"
                      style={{ width: `${(day.inbound / maxMsg) * 100}%` }}
                      title={`${day.inbound} inbound`}
                    />
                    <div
                      className="bg-[#2D4A3E] transition-all"
                      style={{ width: `${(day.outbound / maxMsg) * 100}%` }}
                      title={`${day.outbound} outbound`}
                    />
                  </div>
                  <span className="text-xs text-gray-500 w-12 text-right">{total}</span>
                </div>
              );
            })}
          </div>
          <div className="flex gap-4 mt-3 text-xs text-gray-400">
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-sm bg-blue-400 inline-block" /> Inbound
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-sm bg-[#2D4A3E] inline-block" /> Outbound
            </span>
          </div>
        </div>
      )}

      {/* Empty state */}
      {stats.totalMessages === 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <p className="text-gray-400 text-sm">
            No chat data yet. Messages will appear here once guests start chatting via WhatsApp.
          </p>
        </div>
      )}
    </>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: string;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-center gap-3 mb-2">
        <span className="text-2xl">{icon}</span>
        <span className="text-sm font-medium text-gray-500">{label}</span>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-400 mt-1">{sub}</p>
    </div>
  );
}
