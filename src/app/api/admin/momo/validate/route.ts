import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin/auth";
import { validateMoMoAccount } from "@/lib/payments/momo";

const PHONE_REGEX = /^233[0-9]{9}$/;

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

    const result = await validateMoMoAccount(phone);
    return NextResponse.json(result);
  } catch (error) {
    console.error("MoMo validate error:", error);
    return NextResponse.json(
      { error: "Unable to reach MoMo API. Try again." },
      { status: 502 }
    );
  }
}
