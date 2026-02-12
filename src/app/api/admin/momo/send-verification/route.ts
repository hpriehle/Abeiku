import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin/auth";
import { getHotelById, updateHotel } from "@/lib/db";
import {
  validateMoMoAccount,
  generateVerificationAmount,
  sendVerificationDisbursement,
} from "@/lib/payments/momo";

const PHONE_REGEX = /^233[0-9]{9}$/;
const MAX_SENDS_PER_DAY = 3;
const RATE_LIMIT_HOURS = 24;

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { phone } = await request.json();

    if (!phone || !PHONE_REGEX.test(phone)) {
      return NextResponse.json(
        { error: "Invalid phone format. Expected 233XXXXXXXXX (12 digits)." },
        { status: 400 }
      );
    }

    const hotel = await getHotelById(session.hotelId);
    if (!hotel) return NextResponse.json({ error: "Hotel not found" }, { status: 404 });

    // Block re-verifying the same number that's already verified
    if (hotel.momo_phone_verified && hotel.momo_phone === phone) {
      return NextResponse.json(
        { error: "This number is already verified. Enter a different number to change." },
        { status: 400 }
      );
    }

    // Rate limit: max sends per 24h
    if (
      hotel.momo_verification_attempts >= MAX_SENDS_PER_DAY &&
      hotel.momo_verification_sent_at
    ) {
      const sentAt = new Date(hotel.momo_verification_sent_at);
      const hoursElapsed = (Date.now() - sentAt.getTime()) / (1000 * 60 * 60);
      if (hoursElapsed < RATE_LIMIT_HOURS) {
        const hoursRemaining = Math.ceil(RATE_LIMIT_HOURS - hoursElapsed);
        return NextResponse.json(
          { error: `Too many verification attempts. Try again in ${hoursRemaining} hours.` },
          { status: 429 }
        );
      }
    }

    // Validate the account is active before sending money
    console.log("[MoMo verify] Validating account for phone:", phone);
    const { active } = await validateMoMoAccount(phone);
    console.log("[MoMo verify] Account active:", active);
    if (!active) {
      return NextResponse.json(
        { error: "This phone number does not have an active MoMo account." },
        { status: 400 }
      );
    }

    // Generate random amount and send
    const amountPesewas = generateVerificationAmount();
    console.log("[MoMo verify] Generated amount (pesewas):", amountPesewas, "currency:", hotel.currency);
    console.log("[MoMo verify] Sending disbursement to:", phone);
    const referenceId = await sendVerificationDisbursement(phone, amountPesewas, hotel.currency);
    console.log("[MoMo verify] Disbursement sent, referenceId:", referenceId);

    // Reset attempts if this is a new phone or rate limit window expired
    const shouldResetAttempts =
      hotel.momo_phone !== phone ||
      !hotel.momo_verification_sent_at ||
      (Date.now() - new Date(hotel.momo_verification_sent_at).getTime()) / (1000 * 60 * 60) >= RATE_LIMIT_HOURS;

    await updateHotel(session.hotelId, {
      momo_phone: phone,
      momo_phone_verified: false,
      momo_verification_amount: amountPesewas,
      momo_verification_ref: referenceId,
      momo_verification_attempts: shouldResetAttempts ? 1 : hotel.momo_verification_attempts + 1,
      momo_verification_sent_at: new Date().toISOString(),
    });

    return NextResponse.json({ sent: true });
  } catch (error) {
    console.error("MoMo send-verification error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to send verification: ${message}` },
      { status: 500 }
    );
  }
}
