"use client";

import type { PaymentWithBooking } from "@/lib/db";

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    completed: "bg-green-100 text-green-700",
    pending: "bg-yellow-100 text-yellow-700",
    failed: "bg-red-100 text-red-700",
    refunded: "bg-gray-100 text-gray-600",
  };

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] || "bg-gray-100 text-gray-600"}`}>
      {status}
    </span>
  );
}

function DisbursementBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-xs text-gray-400">N/A</span>;

  const colors: Record<string, string> = {
    completed: "text-green-600",
    processing: "text-blue-600",
    pending: "text-yellow-600",
    failed: "text-red-600",
  };

  return (
    <span className={`text-xs font-medium ${colors[status] || "text-gray-500"}`}>
      {status}
    </span>
  );
}

function ChannelLabel({ channel, provider }: { channel: string | null; provider: string }) {
  if (provider === "momo") return <span className="text-xs text-gray-600">MTN MoMo</span>;
  if (channel === "mobile_money") return <span className="text-xs text-gray-600">MoMo (Paystack)</span>;
  if (channel === "card") return <span className="text-xs text-gray-600">Card</span>;
  return <span className="text-xs text-gray-600">{provider}</span>;
}

export function PaymentsTable({
  payments,
  currency,
}: {
  payments: PaymentWithBooking[];
  currency: string;
}) {
  if (payments.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-gray-400">
        No payments yet. Payments will appear here once guests start booking.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-gray-500 uppercase tracking-wider">
            <th className="px-5 py-3">Date</th>
            <th className="px-5 py-3">Guest</th>
            <th className="px-5 py-3">Room</th>
            <th className="px-5 py-3 text-right">Amount</th>
            <th className="px-5 py-3 text-right">Fee</th>
            <th className="px-5 py-3">Channel</th>
            <th className="px-5 py-3">Status</th>
            <th className="px-5 py-3">Payout</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {payments.map((p) => (
            <tr key={p.id} className="hover:bg-gray-50/50">
              <td className="px-5 py-3 text-gray-600 whitespace-nowrap">
                {new Date(p.created_at).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "2-digit",
                })}
              </td>
              <td className="px-5 py-3 font-medium text-gray-900">
                {p.guest_name || "Unknown"}
              </td>
              <td className="px-5 py-3 text-gray-600">
                {p.room_slug || "-"}
              </td>
              <td className="px-5 py-3 text-right font-medium text-gray-900">
                {currency} {p.hotel_amount.toLocaleString()}
              </td>
              <td className="px-5 py-3 text-right text-gray-500">
                {currency} {p.platform_fee.toLocaleString()}
              </td>
              <td className="px-5 py-3">
                <ChannelLabel channel={p.payment_channel} provider={p.provider} />
              </td>
              <td className="px-5 py-3">
                <StatusBadge status={p.status} />
              </td>
              <td className="px-5 py-3">
                <DisbursementBadge status={p.disbursement_status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
