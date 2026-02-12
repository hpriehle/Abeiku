import { redirect } from "next/navigation";
import { getSession } from "@/lib/admin/auth";
import { getConversationList } from "@/lib/db";
import { InboxTab } from "./InboxTab";

export default async function InboxPage() {
  const session = await getSession();
  if (!session) redirect("/admin/login");

  let conversations: Awaited<ReturnType<typeof getConversationList>>["conversations"] = [];
  let total = 0;

  try {
    const result = await getConversationList(session.hotelId, {
      limit: 30,
      offset: 0,
    });
    conversations = result.conversations;
    total = result.total;
  } catch {
    // Migration may not have been run yet — show empty inbox
  }

  return <InboxTab initialConversations={conversations} initialTotal={total} />;
}
