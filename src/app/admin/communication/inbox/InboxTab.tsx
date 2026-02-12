"use client";

import { useState, useEffect, useCallback } from "react";
import type { ConversationListItem, ChatMessage } from "@/lib/db";
import { MessageThread } from "./MessageThread";
import { ReplyBox } from "./ReplyBox";

const STATE_FILTERS = [
  { value: "", label: "All" },
  { value: "lead", label: "Leads" },
  { value: "booking_pending", label: "Pending" },
  { value: "current_guest", label: "Guests" },
  { value: "checked_out", label: "Checked Out" },
];

const STATE_COLORS: Record<string, string> = {
  lead: "bg-blue-100 text-blue-700",
  booking_pending: "bg-yellow-100 text-yellow-700",
  current_guest: "bg-green-100 text-green-700",
  checked_out: "bg-gray-100 text-gray-600",
};

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function isLive(dateStr: string | null): boolean {
  if (!dateStr) return false;
  return Date.now() - new Date(dateStr).getTime() < 24 * 60 * 60 * 1000;
}

export function InboxTab({
  initialConversations,
  initialTotal,
}: {
  initialConversations: ConversationListItem[];
  initialTotal: number;
}) {
  const [conversations, setConversations] = useState(initialConversations);
  const [total, setTotal] = useState(initialTotal);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);

  const selectedConv = conversations.find((c) => c.id === selectedId);

  // Fetch conversations with filters
  const fetchConversations = useCallback(
    async (offset = 0, append = false) => {
      const params = new URLSearchParams({ limit: "30", offset: String(offset) });
      if (stateFilter) params.set("state", stateFilter);
      if (search) params.set("search", search);

      const res = await fetch(`/api/admin/chats/conversations?${params}`);
      if (!res.ok) return;
      const data = await res.json();

      if (append) {
        setConversations((prev) => [...prev, ...data.conversations]);
      } else {
        setConversations(data.conversations);
      }
      setTotal(data.total);
    },
    [stateFilter, search]
  );

  // Refetch when filters change
  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Fetch messages when conversation selected
  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }

    setLoadingMessages(true);
    fetch(`/api/admin/chats/conversations/${selectedId}/messages`)
      .then((res) => res.json())
      .then((data) => {
        setMessages(data.messages ?? []);
        // Mark as read locally
        setConversations((prev) =>
          prev.map((c) => (c.id === selectedId ? { ...c, unread_count: 0 } : c))
        );
      })
      .finally(() => setLoadingMessages(false));
  }, [selectedId]);

  // Handle sending a reply
  const handleSendReply = async (message: string) => {
    if (!selectedId) return;

    const res = await fetch("/api/admin/chats/reply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: selectedId, message, type: "free_text" }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error ?? "Failed to send");
    }

    // Add message to local state
    const now = new Date().toISOString();
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        hotel_id: "",
        conversation_id: selectedId,
        phone: selectedConv?.phone ?? "",
        direction: "outbound",
        message_type: "admin_reply",
        body: message,
        raw_payload: {},
        wa_message_id: null,
        sender_type: "admin",
        sender_name: "You",
        guest_state: selectedConv?.guest_state ?? null,
        step: selectedConv?.step ?? null,
        created_at: now,
      },
    ]);

    // Update conversation preview
    setConversations((prev) =>
      prev.map((c) =>
        c.id === selectedId
          ? { ...c, last_message_at: now, last_message_preview: message.slice(0, 100) }
          : c
      )
    );
  };

  const handleLoadMore = async () => {
    setLoadingMore(true);
    await fetchConversations(conversations.length, true);
    setLoadingMore(false);
  };

  return (
    <div className="flex bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden" style={{ height: "calc(100vh - 220px)" }}>
      {/* Left panel — conversation list */}
      <div className="w-80 border-r border-gray-100 flex flex-col shrink-0">
        {/* Search */}
        <div className="p-3 border-b border-gray-100">
          <input
            type="text"
            placeholder="Search by name or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#2D4A3E]/20 focus:border-[#2D4A3E]"
          />
        </div>

        {/* State filters */}
        <div className="flex gap-1 px-3 py-2 border-b border-gray-100 overflow-x-auto">
          {STATE_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStateFilter(f.value)}
              className={`px-2 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                stateFilter === f.value
                  ? "bg-[#2D4A3E] text-white"
                  : "text-gray-500 hover:bg-gray-100"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-8">No conversations found</p>
          )}
          {conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => setSelectedId(conv.id)}
              className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                selectedId === conv.id ? "bg-gray-50" : ""
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-gray-900 truncate">
                  {conv.guest_name || conv.phone}
                </span>
                <span className="text-[10px] text-gray-400 shrink-0 ml-2">
                  {formatRelativeTime(conv.last_message_at)}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${STATE_COLORS[conv.guest_state] ?? "bg-gray-100 text-gray-600"}`}
                >
                  {conv.guest_state.replace("_", " ")}
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                    isLive(conv.last_message_at)
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-gray-100 text-gray-400"
                  }`}
                >
                  {isLive(conv.last_message_at) ? "Live" : "Idle"}
                </span>
                {conv.unread_count > 0 && (
                  <span className="w-4 h-4 rounded-full bg-[#2D4A3E] text-white text-[10px] flex items-center justify-center font-medium">
                    {conv.unread_count}
                  </span>
                )}
              </div>
              {conv.last_message_preview && (
                <p className="text-xs text-gray-400 mt-1 truncate">{conv.last_message_preview}</p>
              )}
            </button>
          ))}

          {conversations.length < total && (
            <button
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="w-full py-3 text-xs text-[#2D4A3E] font-medium hover:bg-gray-50"
            >
              {loadingMore ? "Loading..." : "Load more"}
            </button>
          )}
        </div>
      </div>

      {/* Right panel — message thread */}
      <div className="flex-1 flex flex-col min-w-0">
        {!selectedId ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-gray-400">Select a conversation to view messages</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {selectedConv?.guest_name || selectedConv?.phone}
                </p>
                <p className="text-xs text-gray-400">
                  {selectedConv?.guest_name ? selectedConv.phone : ""}
                </p>
              </div>
              {selectedConv && (
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${STATE_COLORS[selectedConv.guest_state] ?? "bg-gray-100 text-gray-600"}`}
                >
                  {selectedConv.guest_state.replace("_", " ")}
                </span>
              )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto">
              {loadingMessages ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-sm text-gray-400">Loading messages...</p>
                </div>
              ) : (
                <MessageThread messages={messages} />
              )}
            </div>

            {/* Reply box */}
            <ReplyBox messages={messages} onSend={handleSendReply} />
          </>
        )}
      </div>
    </div>
  );
}
