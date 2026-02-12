// MTN Mobile Money Platform Client — Collections + Disbursements
// Docs: https://momodeveloper.mtn.com/api-documentation/collection/
//
// The platform owns both Collections and Disbursements credentials.
// Collections: collect full amount (booking + fee) from guest.
// Disbursements: forward hotel's portion to the hotel's MoMo number.

import { createPayment } from "@/lib/db";
import { getHotel, getHotelId } from "@/lib/hotel-context";

const MOMO_ENV = process.env.MOMO_ENVIRONMENT ?? "sandbox";
const BASE_URL =
  MOMO_ENV === "production"
    ? "https://proxy.momoapi.mtn.com"
    : "https://sandbox.momodeveloper.mtn.com";

// --- Fee calculation ---

export function calculateFee(
  bookingAmount: number,
  feeType: "flat" | "percentage",
  feeValue: number
): number {
  if (feeType === "percentage") {
    return Math.round(bookingAmount * feeValue) / 100;
  }
  return feeValue;
}

// --- Token management ---

async function getCollectionsToken(): Promise<string> {
  const credentials = Buffer.from(
    `${process.env.MOMO_COLLECTIONS_USER_ID}:${process.env.MOMO_COLLECTIONS_API_KEY}`
  ).toString("base64");

  const res = await fetch(`${BASE_URL}/collection/token/`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Ocp-Apim-Subscription-Key": process.env.MOMO_COLLECTIONS_SUBSCRIPTION_KEY!,
    },
  });

  if (!res.ok) {
    throw new Error(`MoMo Collections token error: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  return data.access_token;
}

async function getDisbursementsToken(): Promise<string> {
  console.log("[MoMo] Getting disbursements token from:", `${BASE_URL}/disbursement/token/`);
  console.log("[MoMo] User ID:", process.env.MOMO_DISBURSEMENTS_USER_ID);
  console.log("[MoMo] Subscription key:", process.env.MOMO_DISBURSEMENTS_SUBSCRIPTION_KEY?.slice(0, 8) + "...");

  const credentials = Buffer.from(
    `${process.env.MOMO_DISBURSEMENTS_USER_ID}:${process.env.MOMO_DISBURSEMENTS_API_KEY}`
  ).toString("base64");

  const res = await fetch(`${BASE_URL}/disbursement/token/`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Ocp-Apim-Subscription-Key": process.env.MOMO_DISBURSEMENTS_SUBSCRIPTION_KEY!,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    console.error("[MoMo] Disbursements token FAILED:", res.status, body);
    throw new Error(`MoMo Disbursements token error: ${res.status} ${body}`);
  }

  const data = await res.json();
  console.log("[MoMo] Disbursements token OK");
  return data.access_token;
}

// --- Collections: request payment from guest ---

/**
 * Request a payment from a guest's mobile money account.
 * Collects the full amount (booking + platform fee) into the platform's account.
 */
export async function requestPayment(booking: {
  id: string;
  phone: string;
  momoPhone: string;
  total_price: number;
  currency: string;
}): Promise<{ referenceId: string; paymentId: string }> {
  const hotelId = getHotelId();
  const hotel = getHotel();
  const token = await getCollectionsToken();
  const referenceId = crypto.randomUUID();

  const platformFee = calculateFee(booking.total_price, hotel.fee_type, hotel.fee_value);
  const totalWithFee = booking.total_price + platformFee;

  // Create payment record
  const payment = await createPayment(hotelId, {
    booking_id: booking.id,
    provider: "momo",
    provider_tx_id: referenceId,
    amount: totalWithFee,
    platform_fee: platformFee,
    hotel_amount: booking.total_price,
    currency: booking.currency,
    status: "pending",
    provider_status: null,
    phone: booking.phone,
    momo_phone: booking.momoPhone,
    disbursement_status: "pending",
    disbursement_reference_id: null,
    disbursement_error: null,
    stripe_payment_link_id: null,
    paystack_reference: null,
    payment_channel: "mobile_money",
  });

  // Format phone for MoMo (MSISDN format, e.g., 233551542355)
  const msisdn = booking.momoPhone.replace(/\+/g, "");
  const effectiveCurrency = MOMO_ENV === "sandbox" ? "EUR" : booking.currency;

  const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/momo/callback`;

  const res = await fetch(`${BASE_URL}/collection/v1_0/requesttopay`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Reference-Id": referenceId,
      "X-Target-Environment": MOMO_ENV,
      "Ocp-Apim-Subscription-Key": process.env.MOMO_COLLECTIONS_SUBSCRIPTION_KEY!,
      "X-Callback-Url": callbackUrl,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: totalWithFee.toString(),
      currency: effectiveCurrency,
      externalId: booking.id,
      payer: {
        partyIdType: "MSISDN",
        partyId: msisdn,
      },
      payerMessage: `${hotel.name} Booking deposit`,
      payeeNote: `Booking ${booking.id}`,
    }),
  });

  if (!res.ok) {
    throw new Error(`MoMo requesttopay error: ${res.status} ${await res.text()}`);
  }

  return { referenceId, paymentId: payment.id };
}

// --- Disbursements: pay hotel's portion ---

/**
 * Disburse the hotel's portion to their MoMo number.
 * Called after a successful collection.
 */
export async function requestDisbursement(params: {
  amount: number;
  currency: string;
  hotelPhone: string;
  externalId: string;
  bookingId: string;
}): Promise<string> {
  const token = await getDisbursementsToken();
  const referenceId = crypto.randomUUID();

  const msisdn = params.hotelPhone.replace(/\+/g, "");
  const effectiveCurrency = MOMO_ENV === "sandbox" ? "EUR" : params.currency;
  const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/momo/disbursement-callback`;

  const res = await fetch(`${BASE_URL}/disbursement/v1_0/transfer`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Reference-Id": referenceId,
      "X-Target-Environment": MOMO_ENV,
      "Ocp-Apim-Subscription-Key": process.env.MOMO_DISBURSEMENTS_SUBSCRIPTION_KEY!,
      "X-Callback-Url": callbackUrl,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: params.amount.toString(),
      currency: effectiveCurrency,
      externalId: params.externalId,
      payee: {
        partyIdType: "MSISDN",
        partyId: msisdn,
      },
      payerMessage: `Payout for booking ${params.bookingId}`,
      payeeNote: `Booking ${params.bookingId}`,
    }),
  });

  if (!res.ok) {
    throw new Error(`MoMo disbursement error: ${res.status} ${await res.text()}`);
  }

  return referenceId;
}

// --- Account validation ---

/**
 * Check if a phone number has an active MoMo account.
 * Uses the MTN isPayerActive endpoint — instant, no money sent.
 */
export async function validateMoMoAccount(phone: string): Promise<{ active: boolean }> {
  const token = await getDisbursementsToken();
  const msisdn = phone.replace(/\+/g, "");

  const res = await fetch(
    `${BASE_URL}/disbursement/v1_0/accountholder/msisdn/${msisdn}/active`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Target-Environment": MOMO_ENV,
        "Ocp-Apim-Subscription-Key": process.env.MOMO_DISBURSEMENTS_SUBSCRIPTION_KEY!,
      },
    }
  );

  if (!res.ok) {
    throw new Error(`MoMo account validation error: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  return { active: data.result === true };
}

// --- Verification micro-deposit ---

/**
 * Generate a random verification amount in pesewas (GHS 1.01-1.99).
 * 99 possible values — brute-force in 5 attempts = ~5% chance.
 */
export function generateVerificationAmount(): number {
  return Math.floor(Math.random() * 99) + 101;
}

/**
 * Send a micro-deposit to verify a hotel's MoMo phone ownership.
 * Returns the disbursement reference ID for tracking.
 */
export async function sendVerificationDisbursement(
  phone: string,
  amountPesewas: number,
  currency: string
): Promise<string> {
  const token = await getDisbursementsToken();
  const referenceId = crypto.randomUUID();
  const msisdn = phone.replace(/\+/g, "");
  const amountMajor = (amountPesewas / 100).toFixed(2);
  const effectiveCurrency = MOMO_ENV === "sandbox" ? "EUR" : currency;

  const requestBody = {
    amount: amountMajor,
    currency: effectiveCurrency,
    externalId: referenceId,
    payee: {
      partyIdType: "MSISDN",
      partyId: msisdn,
    },
    payerMessage: "Abeiku phone verification",
    payeeNote: "Verification micro-deposit",
  };

  console.log("[MoMo] Sending verification disbursement:", JSON.stringify(requestBody, null, 2));
  console.log("[MoMo] URL:", `${BASE_URL}/disbursement/v1_0/transfer`);
  console.log("[MoMo] X-Reference-Id:", referenceId);
  console.log("[MoMo] X-Target-Environment:", MOMO_ENV);

  const res = await fetch(`${BASE_URL}/disbursement/v1_0/transfer`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Reference-Id": referenceId,
      "X-Target-Environment": MOMO_ENV,
      "Ocp-Apim-Subscription-Key": process.env.MOMO_DISBURSEMENTS_SUBSCRIPTION_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  console.log("[MoMo] Disbursement response status:", res.status);

  if (!res.ok) {
    const body = await res.text();
    console.error("[MoMo] Disbursement FAILED:", res.status, body);
    throw new Error(`MoMo verification disbursement error: ${res.status} ${body}`);
  }

  console.log("[MoMo] Disbursement OK, referenceId:", referenceId);
  return referenceId;
}

// --- Status checks (polling fallback) ---

export async function checkPaymentStatus(referenceId: string): Promise<{
  status: "PENDING" | "SUCCESSFUL" | "FAILED";
  reason?: string;
}> {
  const token = await getCollectionsToken();

  const res = await fetch(
    `${BASE_URL}/collection/v1_0/requesttopay/${referenceId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Target-Environment": MOMO_ENV,
        "Ocp-Apim-Subscription-Key": process.env.MOMO_COLLECTIONS_SUBSCRIPTION_KEY!,
      },
    }
  );

  if (!res.ok) {
    throw new Error(`MoMo status check error: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  return { status: data.status, reason: data.reason };
}

export async function checkDisbursementStatus(referenceId: string): Promise<{
  status: "PENDING" | "SUCCESSFUL" | "FAILED";
  reason?: string;
}> {
  const token = await getDisbursementsToken();

  const res = await fetch(
    `${BASE_URL}/disbursement/v1_0/transfer/${referenceId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Target-Environment": MOMO_ENV,
        "Ocp-Apim-Subscription-Key": process.env.MOMO_DISBURSEMENTS_SUBSCRIPTION_KEY!,
      },
    }
  );

  if (!res.ok) {
    throw new Error(`MoMo disbursement status check error: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  return { status: data.status, reason: data.reason };
}
