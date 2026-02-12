// POST /api/momo/callback — MoMo collection payment status webhook
//
// After a successful collection, this handler:
// 1. Marks payment as completed
// 2. Records platform earnings
// 3. Immediately disburses the hotel's portion to their MoMo number
// 4. Notifies the guest via WhatsApp

import { NextRequest, NextResponse } from "next/server";
import {
  getPaymentByProviderTx,
  getHotelById,
  getConversation,
  updatePayment,
  updateBooking,
  createDisbursement,
  updateDisbursement,
  createPlatformEarning,
  updatePaymentGlobal,
} from "@/lib/db";
import { logEvent } from "@/lib/whatsapp/chat-logger";
import { hotelStorage } from "@/lib/hotel-context";
import { sendText, sendButtons } from "@/lib/whatsapp/client";
import { requestDisbursement } from "@/lib/payments/momo";
import { notifyOwner } from "@/lib/notifications";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // MoMo callback contains: referenceId, status, reason, etc.
    const referenceId = body.externalId || body.referenceId;
    const status = body.status as string;

    if (!referenceId) {
      return NextResponse.json({ error: "Missing referenceId" }, { status: 400 });
    }

    // Global lookup — find payment by provider transaction ID
    const payment = await getPaymentByProviderTx(referenceId);
    if (!payment) {
      console.error("MoMo callback: payment not found for ref:", referenceId);
      return NextResponse.json({ received: true });
    }

    // Load hotel for this payment
    const hotel = await getHotelById(payment.hotel_id);
    if (!hotel) {
      console.error("MoMo callback: hotel not found for payment:", payment.id);
      return NextResponse.json({ received: true });
    }

    // Run in hotel context so WhatsApp client uses correct credentials
    await hotelStorage.run({ hotelId: hotel.id, hotel }, async () => {
      if (status === "SUCCESSFUL") {
        // 1. Mark payment as completed
        await updatePayment(hotel.id, payment.id, {
          status: "completed",
          provider_status: status,
        });

        await updateBooking(hotel.id, payment.booking_id, {
          payment_status: "paid",
          payment_provider: "momo",
        });

        // 2. Record platform earnings
        await createPlatformEarning({
          payment_id: payment.id,
          hotel_id: hotel.id,
          amount: payment.platform_fee,
          fee_type: hotel.fee_type,
          fee_value: hotel.fee_value,
        });

        // 3. Disburse hotel's portion
        if (hotel.momo_phone && hotel.momo_phone_verified) {
          try {
            const disbursement = await createDisbursement({
              payment_id: payment.id,
              hotel_id: hotel.id,
              amount: payment.hotel_amount,
              recipient_phone: hotel.momo_phone,
              method: "mtn_direct",
              status: "processing",
            });

            const mtnRefId = await requestDisbursement({
              amount: payment.hotel_amount,
              currency: payment.currency,
              hotelPhone: hotel.momo_phone,
              externalId: disbursement.id,
              bookingId: payment.booking_id,
            });

            await updateDisbursement(disbursement.id, {
              mtn_reference_id: mtnRefId,
            });

            await updatePaymentGlobal(payment.id, {
              disbursement_status: "processing",
              disbursement_reference_id: mtnRefId,
            });
          } catch (disbErr) {
            console.error("MoMo disbursement failed:", disbErr);
            await updatePaymentGlobal(payment.id, {
              disbursement_status: "failed",
              disbursement_error: disbErr instanceof Error ? disbErr.message : "Unknown error",
            });
          }
        } else {
          const reason = !hotel.momo_phone
            ? "Hotel has no MoMo phone number configured"
            : "Hotel MoMo phone not verified";
          console.warn(`${reason} — skipping disbursement for payment:`, payment.id);
          await updatePaymentGlobal(payment.id, {
            disbursement_status: "failed",
            disbursement_error: reason,
          });
        }

        // 4. Log funnel: booked (payment completed)
        if (payment.phone) {
          const conv = await getConversation(hotel.id, payment.phone);
          if (conv) {
            logEvent({ hotelId: hotel.id, conversationId: conv.id, phone: payment.phone, eventType: "funnel_step", funnelStep: "booked", metadata: { booking_id: payment.booking_id, provider: "momo" } });
            logEvent({ hotelId: hotel.id, conversationId: conv.id, phone: payment.phone, eventType: "payment_completed", metadata: { payment_id: payment.id, provider: "momo" } });
          }
        }

        // 5. Notify guest
        if (payment.phone) {
          await sendText(
            payment.phone,
            `✅ *Payment Received!*\n\n💰 ${hotel.currency} ${payment.hotel_amount} has been confirmed.\n\nThank you! We look forward to welcoming you. 🌿`
          );
        }

        // 6. Notify hotel owner (fire-and-forget)
        notifyOwner(hotel.id, "payment_received", {
          guest_name: "Guest",
          amount: payment.hotel_amount,
          provider: "momo",
          booking_id: payment.booking_id,
        });
      } else if (status === "FAILED") {
        await updatePayment(hotel.id, payment.id, {
          status: "failed",
          provider_status: body.reason || status,
          disbursement_status: null,
        });

        // Notify guest with retry option
        if (payment.phone) {
          await sendText(
            payment.phone,
            `❌ Payment was not completed.\n\nReason: ${body.reason || "Transaction failed"}\n\nPlease try again or choose a different payment method.`
          );
          await sendButtons(
            payment.phone,
            "How would you like to proceed?",
            [
              { id: `pay_momo_${payment.booking_id}`, title: "Try MoMo Again" },
              { id: `pay_card_${payment.booking_id}`, title: "Pay with Card" },
            ]
          );
        }

        // Notify hotel owner (fire-and-forget)
        notifyOwner(hotel.id, "payment_failed", {
          guest_name: "Guest",
          amount: payment.amount,
          reason: body.reason || "Transaction failed",
          booking_id: payment.booking_id,
        });
      }
    });

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("MoMo callback error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
