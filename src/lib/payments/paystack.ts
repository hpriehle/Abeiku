// Paystack Payment Client — Card Payments with Subaccount Splits
// Docs: https://paystack.com/docs/api/
//
// The platform owns one Paystack account (keys in env vars).
// Each hotel has a subaccount — Paystack auto-splits at payment time.
// transaction_charge = platform fee (goes to platform account).
// Hotel bears Paystack's processing fee (bearer: "subaccount").

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

// --- Payment initialization ---

/**
 * Initialize a Paystack transaction for a booking.
 * Returns the hosted checkout URL to send to the guest via WhatsApp.
 */
export async function initializePayment(booking: {
  id: string;
  phone: string;
  guest_name: string;
  total_price: number;
  currency: string;
  check_in: string;
  check_out: string;
}): Promise<{ authorization_url: string; access_code: string; reference: string; paymentId: string }> {
  const hotelId = getHotelId();
  const hotel = getHotel();

  if (!hotel.paystack_subaccount_code) {
    throw new Error(`Hotel "${hotel.name}" has no Paystack subaccount configured`);
  }

  const platformFee = calculateFee(booking.total_price, hotel.fee_type, hotel.fee_value);
  const totalWithFee = booking.total_price + platformFee;
  const reference = `bk_${booking.id}_${Date.now()}`;

  // Create payment record before initializing with Paystack
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
    momo_phone: null,
    disbursement_status: null,
    disbursement_reference_id: null,
    disbursement_error: null,
    stripe_payment_link_id: null,
    paystack_reference: reference,
    payment_channel: "card",
  });

  const res = await fetch(`${BASE_URL}/transaction/initialize`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      amount: Math.round(totalWithFee * 100), // Paystack uses pesewas/kobo
      currency: booking.currency.toUpperCase(),
      email: `${booking.phone.replace(/\+/g, "")}@guest.abeiku.com`,
      reference,
      subaccount: hotel.paystack_subaccount_code,
      bearer: "subaccount",
      transaction_charge: Math.round(platformFee * 100),
      callback_url: `${process.env.NEXT_PUBLIC_APP_URL}/booking/payment-callback?ref=${reference}`,
      metadata: {
        booking_id: booking.id,
        phone: booking.phone,
        hotel_id: hotelId,
        guest_name: booking.guest_name,
        check_in: booking.check_in,
        check_out: booking.check_out,
        custom_fields: [
          { display_name: "Guest", variable_name: "guest", value: booking.guest_name },
          { display_name: "Booking", variable_name: "booking_id", value: booking.id },
        ],
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Paystack initialize error: ${res.status} ${text}`);
  }

  const data = await res.json();

  if (!data.status) {
    throw new Error(`Paystack initialize failed: ${data.message}`);
  }

  return {
    authorization_url: data.data.authorization_url,
    access_code: data.data.access_code,
    reference: data.data.reference,
    paymentId: payment.id,
  };
}

// --- Transaction verification ---

export async function verifyTransaction(reference: string): Promise<{
  status: boolean;
  amount: number;
  currency: string;
  channel: string;
  gateway_response: string;
  metadata: Record<string, unknown>;
}> {
  const res = await fetch(`${BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: getHeaders(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Paystack verify error: ${res.status} ${text}`);
  }

  const data = await res.json();
  const tx = data.data;

  return {
    status: tx.status === "success",
    amount: tx.amount / 100, // Convert back from pesewas
    currency: tx.currency,
    channel: tx.channel,
    gateway_response: tx.gateway_response,
    metadata: tx.metadata ?? {},
  };
}

// --- Subaccount management (admin) ---

export async function createSubaccount(params: {
  business_name: string;
  settlement_bank: string;
  account_number: string;
  percentage_charge: number;
}): Promise<{ subaccount_code: string }> {
  const res = await fetch(`${BASE_URL}/subaccount`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      business_name: params.business_name,
      settlement_bank: params.settlement_bank,
      account_number: params.account_number,
      percentage_charge: params.percentage_charge,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Paystack create subaccount error: ${res.status} ${text}`);
  }

  const data = await res.json();

  if (!data.status) {
    throw new Error(`Paystack create subaccount failed: ${data.message}`);
  }

  return { subaccount_code: data.data.subaccount_code };
}

export async function listBanks(country: string = "ghana"): Promise<
  Array<{ name: string; code: string; slug: string }>
> {
  const res = await fetch(`${BASE_URL}/bank?country=${country}`, {
    headers: getHeaders(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Paystack list banks error: ${res.status} ${text}`);
  }

  const data = await res.json();
  return data.data.map((b: { name: string; code: string; slug: string }) => ({
    name: b.name,
    code: b.code,
    slug: b.slug,
  }));
}

export async function resolveAccount(
  accountNumber: string,
  bankCode: string
): Promise<{ account_name: string; account_number: string }> {
  const res = await fetch(
    `${BASE_URL}/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`,
    { headers: getHeaders() }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Paystack resolve account error: ${res.status} ${text}`);
  }

  const data = await res.json();

  if (!data.status) {
    throw new Error(`Paystack resolve account failed: ${data.message}`);
  }

  return {
    account_name: data.data.account_name,
    account_number: data.data.account_number,
  };
}