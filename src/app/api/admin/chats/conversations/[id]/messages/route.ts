import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin/auth";
import { getMessagesForConversation, getConversation, resetUnreadCount } from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: conversationId } = await params;
  const searchParams = request.nextUrl.searchParams;
  const limit = parseInt(searchParams.get("limit") ?? "50", 10);
  const before = searchParams.get("before") ?? undefined;

  try {
    // Verify conversation belongs to this hotel by looking up via conversation table
    // We need the phone to call getConversation, but we have the ID.
    // Use messages query directly — hotel_id filter ensures ownership.
    const messages = await getMessagesForConversation(session.hotelId, conversationId, {
      limit,
      before,
    });

    // Reset unread count when admin views messages
    await resetUnreadCount(session.hotelId, conversationId);

    return NextResponse.json({
      messages,
      hasMore: messages.length === limit,
    });
  } catch (error) {
    console.error("Messages fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch messages" }, { status: 500 });
  }
}
