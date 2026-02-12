// POST /api/momo/disbursement-callback — MoMo disbursement status webhook
//
// Called by MTN when a hotel disbursement completes or fails.

import { NextRequest, NextResponse } from "next/server";
import {
  getDisbursementByMtnReference,
  updateDisbursement,
  updatePaymentGlobal,
} from "@/lib/db";
import { notifyOwner } from "@/lib/notifications";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const referenceId = body.externalId || body.referenceId;
    const status = body.status as string;

    if (!referenceId) {
      return NextResponse.json({ error: "Missing referenceId" }, { status: 400 });
    }

    // Look up disbursement by MTN reference
    const disbursement = await getDisbursementByMtnReference(referenceId);
    if (!disbursement) {
      console.error("Disbursement callback: not found for ref:", referenceId);
      return NextResponse.json({ received: true });
    }

    if (status === "SUCCESSFUL") {
      await updateDisbursement(disbursement.id, {
        status: "completed",
        completed_at: new Date().toISOString(),
      });

      await updatePaymentGlobal(disbursement.payment_id, {
        disbursement_status: "completed",
      });

      console.log("Disbursement completed:", disbursement.id, "→", disbursement.recipient_phone);

      // Notify hotel owner (fire-and-forget)
      notifyOwner(disbursement.hotel_id, "disbursement_completed", {
        amount: disbursement.amount,
        recipient_phone: disbursement.recipient_phone,
        disbursement_id: disbursement.id,
      });
    } else if (status === "FAILED") {
      const reason = body.reason?.message || body.reason || "Unknown error";

      await updateDisbursement(disbursement.id, {
        status: "failed",
        error_message: typeof reason === "string" ? reason : JSON.stringify(reason),
      });

      await updatePaymentGlobal(disbursement.payment_id, {
        disbursement_status: "failed",
        disbursement_error: typeof reason === "string" ? reason : JSON.stringify(reason),
      });

      console.error("Disbursement failed:", disbursement.id, reason);

      // Notify hotel owner (fire-and-forget)
      notifyOwner(disbursement.hotel_id, "disbursement_failed", {
        amount: disbursement.amount,
        error_message: typeof reason === "string" ? reason : JSON.stringify(reason),
        disbursement_id: disbursement.id,
      });
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Disbursement callback error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
