// Paystack Transfers — Send payouts to hotel MoMo wallets
// Docs: https://paystack.com/docs/transfers/
//
// Used when hotel.payout_method === "momo".
// For bank payouts, Paystack subaccount auto-settlement handles it (no transfer needed).

const BASE_URL = "https://api.paystack.co";

function getHeaders(): Record<string, string> {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("Missing PAYSTACK_SECRET_KEY env var");
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

/**
 * Create a transfer recipient for MoMo payouts.
 * Call once per hotel when they set payout_method to "momo".
 */
export async function createTransferRecipient(
  name: string,
  phone: string,
  currency: string = "GHS"
): Promise<{ recipient_code: string }> {
  const msisdn = phone.replace(/\+/g, "");

  const res = await fetch(`${BASE_URL}/transferrecipient`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      type: "mobile_money",
      name,
      account_number: msisdn,
      bank_code: "MTN", // Paystack uses bank_code for MoMo providers too
      currency,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Paystack create recipient error: ${res.status} ${text}`);
  }

  const data = await res.json();

  if (!data.status) {
    throw new Error(`Paystack create recipient failed: ${data.message}`);
  }

  return { recipient_code: data.data.recipient_code };
}

/**
 * Initiate a transfer to a hotel's MoMo wallet.
 * Called after a successful payment when hotel.payout_method === "momo".
 */
export async function initiateTransfer(
  amount: number,
  recipientCode: string,
  reason: string,
  currency: string = "GHS"
): Promise<{ transfer_code: string; status: string }> {
  const res = await fetch(`${BASE_URL}/transfer`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      source: "balance",
      amount: Math.round(amount * 100), // pesewas
      recipient: recipientCode,
      reason,
      currency,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Paystack transfer error: ${res.status} ${text}`);
  }

  const data = await res.json();

  if (!data.status) {
    throw new Error(`Paystack transfer failed: ${data.message}`);
  }

  return {
    transfer_code: data.data.transfer_code,
    status: data.data.status,
  };
}
