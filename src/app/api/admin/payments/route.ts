import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin/auth";
import { getPaymentsForHotel, getPaymentStats } from "@/lib/db";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") as "pending" | "completed" | "failed" | "refunded" | undefined;
  const provider = searchParams.get("provider") as "momo" | "paystack" | "stripe" | undefined;
  const limit = parseInt(searchParams.get("limit") || "50");
  const offset = parseInt(searchParams.get("offset") || "0");

  try {
    const [payments, stats] = await Promise.all([
      getPaymentsForHotel(session.hotelId, {
        status: status || undefined,
        provider: provider || undefined,
        limit,
        offset,
      }),
      getPaymentStats(session.hotelId),
    ]);

    return NextResponse.json({ payments, stats });
  } catch (error) {
    console.error("Payments API error:", error);
    return NextResponse.json({ error: "Failed to fetch payments" }, { status: 500 });
  }
}
