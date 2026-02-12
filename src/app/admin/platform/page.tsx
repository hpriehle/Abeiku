import { redirect } from "next/navigation";
import { getSession } from "@/lib/admin/auth";
import { getPlatformStats, getAllHotelEarnings } from "@/lib/db";

function StatCard({ label, value, sub, icon }: { label: string; value: string | number; sub?: string; icon: string }) {
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-2xl font-bold mt-1 text-gray-900">{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
        </div>
        <span className="text-2xl">{icon}</span>
      </div>
    </div>
  );
}

export default async function PlatformPage() {
  const session = await getSession();
  if (!session) redirect("/admin/login");

  if (session.role !== "platform_admin") {
    redirect("/admin/dashboard");
  }

  const [stats, earnings] = await Promise.all([
    getPlatformStats(),
    getAllHotelEarnings(),
  ]);

  const avgFee = stats.totalProcessed > 0
    ? ((stats.totalEarnings / stats.totalProcessed) * 100).toFixed(1)
    : "0";

  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Platform Overview</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          icon="&#128176;"
          label="Platform Earnings"
          value={`GHS ${stats.totalEarnings.toLocaleString()}`}
          sub="Total fees collected"
        />
        <StatCard
          icon="&#128179;"
          label="Total Processed"
          value={`GHS ${stats.totalProcessed.toLocaleString()}`}
          sub="Across all hotels"
        />
        <StatCard
          icon="&#127968;"
          label="Active Hotels"
          value={stats.activeHotels}
        />
        <StatCard
          icon="&#128200;"
          label="Avg Fee Rate"
          value={`${avgFee}%`}
          sub="Of total processed"
        />
      </div>

      {/* Per-hotel earnings */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-5 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">Earnings by Hotel</h3>
        </div>

        {earnings.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">
            No earnings recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 uppercase tracking-wider">
                  <th className="px-5 py-3">Hotel</th>
                  <th className="px-5 py-3 text-right">Earnings</th>
                  <th className="px-5 py-3 text-right">Transactions</th>
                  <th className="px-5 py-3">Payout Method</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {earnings
                  .sort((a, b) => b.total - a.total)
                  .map((e) => (
                    <tr key={e.hotel_id} className="hover:bg-gray-50/50">
                      <td className="px-5 py-3 font-medium text-gray-900">
                        {e.hotel_name}
                      </td>
                      <td className="px-5 py-3 text-right font-medium text-gray-900">
                        GHS {e.total.toLocaleString()}
                      </td>
                      <td className="px-5 py-3 text-right text-gray-600">
                        {e.fee_count}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          e.payout_method === "momo"
                            ? "bg-yellow-100 text-yellow-700"
                            : "bg-blue-100 text-blue-700"
                        }`}>
                          {e.payout_method === "momo" ? "MoMo" : "Bank"}
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
