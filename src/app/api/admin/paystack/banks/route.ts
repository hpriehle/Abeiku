import { NextResponse } from "next/server";
import { getSession } from "@/lib/admin/auth";
import { listBanks } from "@/lib/payments/paystack";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const banks = await listBanks();
    return NextResponse.json({ banks });
  } catch (error) {
    console.error("Paystack list banks error:", error);
    return NextResponse.json({ error: "Failed to fetch banks" }, { status: 500 });
  }
}