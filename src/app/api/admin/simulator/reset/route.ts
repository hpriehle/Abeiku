import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin/auth";
import { supabase } from "@/lib/supabase/client";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { phone } = await request.json();
  if (!phone) return NextResponse.json({ error: "Phone required" }, { status: 400 });

  // Delete conversation events and chat messages first (FK constraint)
  const { data: conv } = await supabase
    .from("conversations")
    .select("id")
    .eq("hotel_id", session.hotelId)
    .eq("phone", phone)
    .maybeSingle();

  if (conv) {
    await supabase.from("conversation_events").delete().eq("conversation_id", conv.id);
    await supabase.from("chat_messages").delete().eq("conversation_id", conv.id);
    await supabase.from("conversations").delete().eq("id", conv.id);
  }

  return NextResponse.json({ ok: true });
}
