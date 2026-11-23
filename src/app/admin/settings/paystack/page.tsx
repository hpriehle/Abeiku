import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/admin/auth";
import { getHotelById } from "@/lib/db";
import { adminFeatures } from "@/lib/admin/features";
import { PaystackSubaccountWizard } from "./PaystackForm";

export default async function PaystackSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/admin/login");

  const hotel = await getHotelById(session.hotelId);
  if (!hotel) redirect("/admin/login");
  // L3: guests only pay through WhatsApp, so payouts are hidden without it.
  if (!adminFeatures(hotel, session.role).payouts) redirect("/admin/settings");

  const feeLabel =
    hotel.fee_type && hotel.fee_value != null
      ? hotel.fee_type === "percentage"
        ? `${hotel.fee_value}% of booking`
        : `${hotel.currency} ${hotel.fee_value} per booking`
      : null;

  return (
    <div className="admin-page-narrow">
      <Link
        href="/admin/settings"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        &larr; Back to Settings
      </Link>

      <div className="flex items-center gap-3 mb-6">
        <div>
          <h1 className="admin-h1">Card Payments</h1>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                hotel.paystack_subaccount_code ? "bg-green-500" : "bg-yellow-400"
              }`}
            />
            <span className={`text-sm ${hotel.paystack_subaccount_code ? "text-green-700" : "text-amber-700"}`}>
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