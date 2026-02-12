import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin/auth";
import { getHotelById, updateHotel } from "@/lib/db";
import { createTransferRecipient } from "@/lib/payments/paystack-transfer";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const hotel = await getHotelById(session.hotelId);
    if (!hotel) return NextResponse.json({ error: "Hotel not found" }, { status: 404 });

    const { payout_method, momo_phone } = await request.json();

    if (payout_method !== "bank" && payout_method !== "momo") {
      return NextResponse.json({ error: "Invalid payout method" }, { status: 400 });
    }

    if (payout_method === "momo") {
      if (!momo_phone) {
        return NextResponse.json({ error: "MoMo phone number is required" }, { status: 400 });
      }

      // Create a Paystack transfer recipient for MoMo payouts
      const phone = momo_phone.replace(/\+/g, "");
      const { recipient_code } = await createTransferRecipient(
        hotel.name,
        phone,
        hotel.currency
      );

      await updateHotel(session.hotelId, {
        payout_method: "momo",
        paystack_transfer_recipient_code: recipient_code,
      });

      return NextResponse.json({ payout_method: "momo", recipient_code });
    }

    // Bank payout — subaccount auto-settles, no transfer recipient needed
    await updateHotel(session.hotelId, {
      payout_method: "bank",
      paystack_transfer_recipient_code: null,
    });

    return NextResponse.json({ payout_method: "bank" });
  } catch (error) {
    console.error("Payout preference error:", error);
    return NextResponse.json(
      { error: "Failed to update payout preference" },
      { status: 500 }
    );
  }
}
