import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/admin/auth";
import { getHotelById } from "@/lib/db";
import { PaystackSubaccountWizard } from "./PaystackForm";

export default async function PaystackSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/admin/login");

  const hotel = await getHotelById(session.hotelId);
  if (!hotel) redirect("/admin/login");

  const feeLabel =
    hotel.fee_type && hotel.fee_value != null
      ? hotel.fee_type === "percentage"
        ? `${hotel.fee_value}% of booking`
        : `${hotel.currency} ${hotel.fee_value} per booking`
      : null;

  return (
    <div className="p-8 max-w-3xl">
      <Link
        href="/admin/settings"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        &larr; Back to Settings
      </Link>

      <div className="flex items-center gap-3 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Card Payments</h2>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                hotel.paystack_subaccount_code ? "bg-green-500" : "bg-yellow-400"
              }`}
            />
            <span className={`text-sm ${hotel.paystack_subaccount_code ? "text-green-600" : "text-yellow-600"}`}>
              {hotel.paystack_subaccount_code ? "Connected" : "Not configured"}
            </span>
          </div>
        </div>
      </div>

      <PaystackSubaccountWizard
        isConnected={!!hotel.paystack_subaccount_code}
        subaccountCode={hotel.paystack_subaccount_code}
        currency={hotel.currency}
        feeLabel={feeLabel}
        payoutMethod={hotel.payout_method}
        momoPhone={hotel.momo_phone}
      />
    </div>
  );
}