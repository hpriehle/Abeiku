import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin/auth";
import { getHotelById, updateHotel } from "@/lib/db";
import { createSubaccount } from "@/lib/payments/paystack";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const hotel = await getHotelById(session.hotelId);
    if (!hotel) return NextResponse.json({ error: "Hotel not found" }, { status: 404 });

    const { settlement_bank, account_number } = await request.json();

    if (!settlement_bank || !account_number) {
      return NextResponse.json(
        { error: "Bank and account number are required." },
        { status: 400 }
      );
    }

    // Create subaccount with 0% charge — platform fee is handled via transaction_charge
    const { subaccount_code } = await createSubaccount({
      business_name: hotel.name,
      settlement_bank,
      account_number,
      percentage_charge: 0,
    });

    await updateHotel(session.hotelId, {
      paystack_subaccount_code: subaccount_code,
    });

    return NextResponse.json({ subaccount_code });
  } catch (error) {
    console.error("Paystack create subaccount error:", error);
    return NextResponse.json(
      { error: "Failed to create subaccount. Please check your bank details." },
      { status: 500 }
    );
  }
}