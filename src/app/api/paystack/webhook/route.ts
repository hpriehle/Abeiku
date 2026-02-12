// POST /api/paystack/webhook — Paystack payment webhook
//
// Handles:
// 1. charge.success — payment completed (card or MoMo)
// 2. charge.failed — payment failed
// 3. transfer.success — MoMo payout completed
// 4. transfer.failed — MoMo payout failed

import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  getPaymentByPaystackReference,
  getHotelById,
  getConversation,
  updatePayment,
  updateBooking,
  createPlatformEarning,
  createDisbursement,
  updateDisbursement,
  updatePaymentGlobal,
} from "@/lib/db";
import { logEvent } from "@/lib/whatsapp/chat-logger";
import { hotelStorage } from "@/lib/hotel-context";
import { sendText, sendButtons } from "@/lib/whatsapp/client";
import { notifyOwner } from "@/lib/notifications";
import { initiateTransfer } from "@/lib/payments/paystack-transfer";

function verifySignature(rawBody: string, signature: string): boolean {
  const secret = process.env.PAYSTACK_WEBHOOK_SECRET;
  if (!secret) {
    console.error("Missing PAYSTACK_WEBHOOK_SECRET env var");
    return false;
  }
  const hash = crypto.createHmac("sha512", secret).update(rawBody).digest("hex");
  return hash === signature;
}

export async function POST(request: NextRequest) {
  const signature = request.headers.get("x-paystack-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const rawBody = await request.text();

  if (!verifySignature(rawBody, signature)) {
    console.error("Paystack webhook: signature verification failed");
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let body: { event: string; data: Record<string, unknown> };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { event, data } = body;

  // Handle transfer events (payout to hotel MoMo)
  if (event === "transfer.success" || event === "transfer.failed") {
    await handleTransferEvent(event, data);
    return NextResponse.json({ received: true });
  }

  // Handle charge events (payment from guest)
  const reference = data.reference as string | undefined;
  if (!reference) {
    return NextResponse.json({ received: true });
  }

  const payment = await getPaymentByPaystackReference(reference);
  if (!payment) {
    console.error("Paystack webhook: payment not found for ref:", reference);
    return NextResponse.json({ received: true });
  }

  // Idempotency: skip if already completed
  if (payment.status === "completed" && event === "charge.success") {
    return NextResponse.json({ received: true });
  }

  const hotel = await getHotelById(payment.hotel_id);
  if (!hotel) {
    console.error("Paystack webhook: hotel not found for payment:", payment.id);
    return NextResponse.json({ received: true });
  }

  await hotelStorage.run({ hotelId: hotel.id, hotel }, async () => {
    if (event === "charge.success") {
      // 1. Mark payment as completed
      await updatePayment(hotel.id, payment.id, {
        status: "completed",
        provider_status: "success",
        provider_tx_id: (data.id as number)?.toString() ?? reference,
      });

      await updateBooking(hotel.id, payment.booking_id, {
        payment_status: "paid",
        payment_provider: "paystack",
      });

      // 2. Record platform earnings
      await createPlatformEarning({
        payment_id: payment.id,
        hotel_id: hotel.id,
        amount: payment.platform_fee,
        fee_type: hotel.fee_type,
        fee_value: hotel.fee_value,
      });

      // 3. Handle disbursement based on hotel's payout preference
      if (hotel.payout_method === "momo" && hotel.paystack_transfer_recipient_code) {
        // MoMo payout: initiate transfer to hotel's MoMo wallet
        try {
          const transfer = await initiateTransfer(
            payment.hotel_amount,
            hotel.paystack_transfer_recipient_code,
            `Payout for booking ${payment.booking_id}`,
            payment.currency
          );

          const disbursement = await createDisbursement({
            payment_id: payment.id,
            hotel_id: hotel.id,
            amount: payment.hotel_amount,
            recipient_phone: hotel.momo_phone || "",
            method: "paystack_transfer",
            status: "processing",
          });

          await updateDisbursement(disbursement.id, {
            paystack_transfer_code: transfer.transfer_code,
          });

          await updatePaymentGlobal(payment.id, {
            disbursement_status: "processing",
            disbursement_reference_id: transfer.transfer_code,
          });
        } catch (err) {
          console.error("Paystack transfer failed:", err);
          await updatePaymentGlobal(payment.id, {
            disbursement_status: "failed",
            disbursement_error: String(err),
          });
        }
      } else {
        // Bank payout: subaccount auto-settles — mark as completed
        await updatePaymentGlobal(payment.id, {
          disbursement_status: "completed",
        });
      }

      // 4. Log funnel: booked (payment completed)
      if (payment.phone) {
        const conv = await getConversation(hotel.id, payment.phone);
        if (conv) {
          logEvent({ hotelId: hotel.id, conversationId: conv.id, phone: payment.phone, eventType: "funnel_step", funnelStep: "booked", metadata: { booking_id: payment.booking_id, provider: "paystack" } });
          logEvent({ hotelId: hotel.id, conversationId: conv.id, phone: payment.phone, eventType: "payment_completed", metadata: { payment_id: payment.id, provider: "paystack" } });
        }
      }

      // 5. Notify guest
      const channel = payment.payment_channel === "mobile_money" ? "Mobile Money" : "Card";
      if (payment.phone) {
        await sendText(
          payment.phone,
          `✅ *Payment Received!*\n\n💰 ${hotel.currency} ${payment.hotel_amount} has been confirmed via ${channel}.\n\nThank you! We look forward to welcoming you. 🌿`
        );
      }

      // 6. Notify hotel owner (fire-and-forget)
      notifyOwner(hotel.id, "payment_received", {
        guest_name: (data.metadata as Record<string, string>)?.guest_name || "Guest",
        amount: payment.hotel_amount,
        provider: "paystack",
        booking_id: payment.booking_id,
      });
    } else if (event === "charge.failed") {
      await updatePayment(hotel.id, payment.id, {
        status: "failed",
        provider_status: (data.gateway_response as string) || "failed",
      });

      // Notify guest with retry options
      if (payment.phone) {
        await sendText(
          payment.phone,
          `❌ Payment was not completed.\n\nReason: ${(data.gateway_response as string) || "Transaction failed"}\n\nPlease try again or choose a different payment method.`
        );
        await sendButtons(
          payment.phone,
          "How would you like to proceed?",
          [
            { id: `pay_card_${payment.booking_id}`, title: "Try Card Again" },
            { id: `pay_momo_${payment.booking_id}`, title: "Mobile Money" },
          ]
        );
      }

      // Notify hotel owner (fire-and-forget)
      notifyOwner(hotel.id, "payment_failed", {
        guest_name: (data.metadata as Record<string, string>)?.guest_name || "Guest",
        amount: payment.amount,
        reason: (data.gateway_response as string) || "Payment failed",
        booking_id: payment.booking_id,
      });
    }
  });

  return NextResponse.json({ received: true });
}

/**
 * Handle Paystack transfer webhook events (MoMo payouts to hotels).
 * transfer_code is in data.transfer_code.
 */
async function handleTransferEvent(event: string, data: Record<string, unknown>) {
  const transferCode = data.transfer_code as string | undefined;
  if (!transferCode) return;

  // Find the disbursement by transfer code
  const { supabase } = await import("@/lib/supabase/client");
  const { data: disbursement, error } = await supabase
    .from("disbursements")
    .select("*")
    .eq("paystack_transfer_code", transferCode)
    .maybeSingle();

  if (error || !disbursement) {
    console.error("Paystack transfer webhook: disbursement not found for code:", transferCode);
    return;
  }

  if (event === "transfer.success") {
    await updateDisbursement(disbursement.id, {
      status: "completed",
      completed_at: new Date().toISOString(),
    });

    await updatePaymentGlobal(disbursement.payment_id, {
      disbursement_status: "completed",
    });
  } else if (event === "transfer.failed") {
    const reason = (data.reason as string) || "Transfer failed";
    await updateDisbursement(disbursement.id, {
      status: "failed",
      error_message: reason,
    });

    await updatePaymentGlobal(disbursement.payment_id, {
      disbursement_status: "failed",
      disbursement_error: reason,
    });
  }
}
