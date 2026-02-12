import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin/auth";
import { getHotelById, updateHotel } from "@/lib/db";

const EXPIRY_MINUTES = 30;

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { amount } = await request.json();

    if (!amount || typeof amount !== "string") {
      return NextResponse.json({ error: "Amount is required" }, { status: 400 });
    }

    const hotel = await getHotelById(session.hotelId);
    if (!hotel) return NextResponse.json({ error: "Hotel not found" }, { status: 404 });

    // Must have a pending verification
    if (hotel.momo_verification_amount == null || hotel.momo_phone_verified) {
      return NextResponse.json(
        { error: "No pending verification. Send a verification first." },
        { status: 400 }
      );
    }

    // Check expiry
    if (hotel.momo_verification_sent_at) {
      const sentAt = new Date(hotel.momo_verification_sent_at);
      const minutesElapsed = (Date.now() - sentAt.getTime()) / (1000 * 60);
      if (minutesElapsed > EXPIRY_MINUTES) {
        await updateHotel(session.hotelId, {
          momo_verification_amount: null,
          momo_verification_ref: null,
        });
        return NextResponse.json(
          { error: "Verification expired. Please send a new verification." },
          { status: 410 }
        );
      }
    }

    // Parse user input to pesewas
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }
    const userPesewas = Math.round(parsed * 100);

    if (userPesewas === hotel.momo_verification_amount) {
      // Match — verified!
      await updateHotel(session.hotelId, {
        momo_phone_verified: true,
        momo_verification_amount: null,
        momo_verification_ref: null,
        momo_verification_attempts: 0,
        momo_verification_sent_at: null,
      });
      return NextResponse.json({ verified: true });
    }

    // Wrong amount
    return NextResponse.json({
      verified: false,
      error: "Amount does not match. Check your MoMo transaction history and try again.",
    });
  } catch (error) {
    console.error("MoMo confirm-verification error:", error);
    return NextResponse.json(
      { error: "Verification check failed. Try again." },
      { status: 500 }
    );
  }
}
