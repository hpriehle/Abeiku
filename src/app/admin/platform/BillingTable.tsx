import { billingView } from "@/lib/billing/access";
import { formatPrice } from "@/lib/billing/plans";
import type { BillingHotel } from "@/lib/billing/store";
import { formatDay } from "../BillingBanner";
import { HotelActions } from "./HotelActions";

const STATUS: Record<string, { text: string; cls: string }> = {
  pending_card: { text: "No card yet", cls: "bg-gray-100 text-gray-800" },
  trialing: { text: "Free trial", cls: "bg-green-100 text-green-900" },
  active: { text: "Paid", cls: "bg-blue-100 text-blue-900" },
  past_due: { text: "Payment failed", cls: "bg-red-100 text-red-900" },
  canceled: { text: "Cancelled", cls: "bg-amber-100 text-amber-950" },
};

/** L2: each hotel's plan, trial days left and billing state (platform admin only). */
export function BillingTable({ hotels }: { hotels: BillingHotel[] | null }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-8">
      <div className="p-5 border-b border-gray-100">
        <h3 className="text-lg font-semibold text-gray-900">Hotel plans</h3>
      </div>
      {hotels === null ? (
        <p className="p-5 text-sm text-gray-700">Billing is not set up in the database yet (docs/l2-signup/billing.sql).</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-600 uppercase tracking-wider">
                <th className="px-5 py-3">Hotel</th>
                <th className="px-5 py-3">State</th>
                <th className="px-5 py-3">Trial left</th>
                <th className="px-5 py-3">Plan</th>
                <th className="px-5 py-3">Next charge or end</th>
                <th className="px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {hotels.map((h) => {
                const v = billingView(h);
                const s = v.suspended ? { text: "Suspended", cls: "bg-red-100 text-red-900" } : v.exempt ? { text: "Exempt", cls: "bg-gray-100 text-gray-800" } : v.status ? STATUS[v.status] : { text: "Not billed", cls: "bg-gray-100 text-gray-800" };
                const end = v.status === "trialing" ? v.trialEndsAt : v.periodEnd;
                return (
                  <tr key={h.id}>
                    <td className="px-5 py-3 font-medium text-gray-900">{h.name}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${s.cls}`}>{s.text}</span>
                    </td>
                    <td className="px-5 py-3 text-gray-800">{v.status === "trialing" ? `${v.trialDaysLeft} days` : ""}</td>
                    <td className="px-5 py-3 text-gray-800">
                      {v.tier && v.currency ? `${formatPrice(v.tier, v.currency)} (${v.roomCount ?? "?"} rooms)` : ""}
                    </td>
                    <td className="px-5 py-3 text-gray-800">{!v.exempt && v.status && end ? formatDay(end) : ""}</td>
                    <td className="px-5 py-3">
                      <HotelActions hotelId={h.id} hotelName={h.name} trialing={v.status === "trialing"} exempt={v.exempt} suspended={v.suspended} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
