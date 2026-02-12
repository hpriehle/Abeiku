import { redirect } from "next/navigation";
import { getSession } from "@/lib/admin/auth";
import { getHotelById, getPaymentsForHotel, getPaymentStats } from "@/lib/db";
import { PaymentsTable } from "./PaymentsTable";

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

export default async function PaymentsPage() {
  const session = await getSession();
  if (!session) redirect("/admin/login");

  const hotel = await getHotelById(session.hotelId);
  if (!hotel) redirect("/admin/login");

  const [payments, stats] = await Promise.all([
    getPaymentsForHotel(session.hotelId, { limit: 50 }),
    getPaymentStats(session.hotelId),
  ]);

  const currency = hotel.currency;
  const payoutLabel = hotel.payout_method === "momo"
    ? "Mobile Money"
    : hotel.paystack_subaccount_code
      ? "Bank Account"
      : "Not configured";

  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Payments</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          icon="&#10003;"
          label="Total Received"
          value={`${currency} ${stats.totalAmount.toLocaleString()}`}
          sub={`${stats.completed} payments`}
        />
        <StatCard
          icon="&#9203;"
          label="Pending"
          value={stats.pending}
          sub="Awaiting confirmation"
        />
        <StatCard
          icon="&#128176;"
          label="Platform Fees Paid"
          value={`${currency} ${stats.totalFees.toLocaleString()}`}
          sub={`Across ${stats.completed} payments`}
        />
        <StatCard
          icon="&#127974;"
          label="Payout Method"
          value={payoutLabel}
          sub={hotel.payout_method === "momo" ? "Instant via MoMo" : "T+1 to bank"}
        />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-5 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">Payment History</h3>
        </div>
        <PaymentsTable payments={payments} currency={currency} />
      </div>
    </div>
  );
}
