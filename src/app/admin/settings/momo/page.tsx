import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/admin/auth";
import { getHotelById } from "@/lib/db";
import { MoMoVerificationWizard } from "./MoMoForm";

export default async function MoMoSettingsPage() {
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
          <h2 className="text-2xl font-bold text-gray-900">Mobile Money Payouts</h2>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                hotel.momo_phone_verified ? "bg-green-500" : "bg-yellow-400"
              }`}
            />
            <span className={`text-sm ${hotel.momo_phone_verified ? "text-green-600" : "text-yellow-600"}`}>
              {hotel.momo_phone_verified
                ? "Verified"
                : hotel.momo_phone
                ? "Pending verification"
                : "Not configured"}
            </span>
          </div>
        </div>
      </div>

      <MoMoVerificationWizard
        initialPhone={hotel.momo_phone}
        isVerified={hotel.momo_phone_verified}
        hasPendingVerification={
          hotel.momo_verification_amount != null && !hotel.momo_phone_verified
        }
        verificationSentAt={hotel.momo_verification_sent_at}
        currency={hotel.currency}
        feeLabel={feeLabel}
      />
    </div>
  );
}
