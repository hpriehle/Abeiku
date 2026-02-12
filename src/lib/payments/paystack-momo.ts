// Paystack MoMo Direct Charge — Collect via mobile money without browser redirect
// Docs: https://paystack.com/docs/payments/accept-payments/#charge
//
// Supports MTN ("mtn"), Vodafone/Telecel ("vod"), AirtelTigo ("atl").
// Uses the same subaccount split as card payments (paystack.ts).

import { createPayment } from "@/lib/db";
import { getHotel, getHotelId } from "@/lib/hotel-context";
import { calculateFee } from "@/lib/payments/momo";

const BASE_URL = "https://api.paystack.co";

function getHeaders(): Record<string, string> {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("Missing PAYSTACK_SECRET_KEY env var");
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

export type MoMoProvider = "mtn" | "vod" | "atl";

export interface ChargeResult {
  reference: string;
  status: "send_otp" | "pay_offline" | "success" | "failed";
  displayText: string;
  paymentId: string;
}

/**
 * Initiate a MoMo charge via Paystack Direct Charge API.
 * Guest receives an OTP via SMS (MTN/Vodafone) or a USSD prompt (AirtelTigo).
 */
export async function chargeMobileMoney(
  booking: {
    id: string;
    phone: string;
    guest_name: string;
    total_price: number;
    currency: string;
  },
  momoPhone: string,
  provider: MoMoProvider
): Promise<ChargeResult> {
  const hotelId = getHotelId();
  const hotel = getHotel();

  if (!hotel.paystack_subaccount_code) {
    throw new Error(`Hotel "${hotel.name}" has no Paystack subaccount configured`);
  }

  const platformFee = calculateFee(booking.total_price, hotel.fee_type, hotel.fee_value);
  const totalWithFee = booking.total_price + platformFee;
  const reference = `mm_${booking.id}_${Date.now()}`;

  // Create payment record
  const payment = await createPayment(hotelId, {
    booking_id: booking.id,
    provider: "paystack",
    provider_tx_id: reference,
    amount: totalWithFee,
    platform_fee: platformFee,
    hotel_amount: booking.total_price,
    currency: booking.currency,
    status: "pending",
    provider_status: null,
    phone: booking.phone,
    momo_phone: momoPhone,
    disbursement_status: null,
    disbursement_reference_id: null,
    disbursement_error: null,
    stripe_payment_link_id: null,
    paystack_reference: reference,
    payment_channel: "mobile_money",
  });

  // Format phone for Paystack (no + prefix)
  const msisdn = momoPhone.replace(/\+/g, "");

  const res = await fetch(`${BASE_URL}/charge`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      amount: Math.round(totalWithFee * 100), // pesewas
      currency: booking.currency.toUpperCase(),
      email: `${booking.phone.replace(/\+/g, "")}@guest.abeiku.com`,
      reference,
      subaccount: hotel.paystack_subaccount_code,
      bearer: "subaccount",
      transaction_charge: Math.round(platformFee * 100),
      mobile_money: {
        phone: msisdn,
        provider,
      },
      metadata: {
        booking_id: booking.id,
        phone: booking.phone,
        hotel_id: hotelId,
        guest_name: booking.guest_name,
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Paystack charge error: ${res.status} ${text}`);
  }

  const data = await res.json();

  if (!data.status) {
    throw new Error(`Paystack charge failed: ${data.message}`);
  }

  const chargeData = data.data;
  const chargeStatus = chargeData.status as string;

  // Map Paystack response to our flow states
  if (chargeStatus === "send_otp") {
    return {
      reference: chargeData.reference,
      status: "send_otp",
      displayText: chargeData.display_text || "Enter the OTP sent to your phone",
      paymentId: payment.id,
    };
  }

  if (chargeStatus === "pay_offline") {
    return {
      reference: chargeData.reference,
      status: "pay_offline",
      displayText: chargeData.display_text || "Complete payment on your phone",
      paymentId: payment.id,
    };
  }

  if (chargeStatus === "success") {
    return {
      reference: chargeData.reference,
      status: "success",
      displayText: "Payment successful",
      paymentId: payment.id,
    };
  }

  // failed or unknown status
  return {
    reference: chargeData.reference,
    status: "failed",
    displayText: chargeData.display_text || chargeData.gateway_response || "Payment failed",
    paymentId: payment.id,
  };
}

/**
 * Submit OTP for a pending MoMo charge.
 * Called after the guest provides the OTP they received via SMS.
 */
export async function submitChargeOTP(
  reference: string,
  otp: string
): Promise<{ status: "success" | "pay_offline" | "failed"; displayText: string }> {
  const res = await fetch(`${BASE_URL}/charge/submit_otp`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ reference, otp }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Paystack submit OTP error: ${res.status} ${text}`);
  }

  const data = await res.json();

  if (!data.status) {
    return {
      status: "failed",
      displayText: data.message || "OTP verification failed",
    };
  }

  const chargeData = data.data;
  const chargeStatus = chargeData.status as string;

  if (chargeStatus === "success") {
    return { status: "success", displayText: "Payment successful" };
  }

  if (chargeStatus === "pay_offline") {
    return {
      status: "pay_offline",
      displayText: chargeData.display_text || "Complete payment on your phone",
    };
  }

  return {
    status: "failed",
    displayText: chargeData.display_text || chargeData.gateway_response || "Payment failed",
  };
}
