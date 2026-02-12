import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin/auth";
import { resolveAccount } from "@/lib/payments/paystack";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { account_number, bank_code } = await request.json();

    if (!account_number || !bank_code) {
      return NextResponse.json(
        { error: "Account number and bank code are required." },
        { status: 400 }
      );
    }

    const result = await resolveAccount(account_number, bank_code);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Paystack verify account error:", error);
    return NextResponse.json(
      { error: "Could not verify account. Please check the details and try again." },
      { status: 400 }
    );
  }
}