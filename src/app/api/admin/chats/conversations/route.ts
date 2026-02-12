import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin/auth";
import { getConversationList } from "@/lib/db";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const limit = parseInt(params.get("limit") ?? "30", 10);
  const offset = parseInt(params.get("offset") ?? "0", 10);
  const state = params.get("state") ?? undefined;
  const search = params.get("search") ?? undefined;

  try {
    const { conversations, total } = await getConversationList(session.hotelId, {
      limit,
      offset,
      state,
      search,
    });

    return NextResponse.json({
      conversations,
      total,
      hasMore: offset + limit < total,
    });
  } catch (error) {
    console.error("Conversation list error:", error);
    return NextResponse.json({ error: "Failed to fetch conversations" }, { status: 500 });
  }
}
