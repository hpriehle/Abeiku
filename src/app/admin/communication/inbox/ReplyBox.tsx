"use client";

import { useState, useMemo } from "react";
import type { ChatMessage } from "@/lib/db";

export function ReplyBox({
  messages,
  onSend,
}: {
  messages: ChatMessage[];
  onSend: (message: string) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if within 24h window
  const isWindowOpen = useMemo(() => {
    const lastInbound = [...messages].reverse().find((m) => m.direction === "inbound");
    if (!lastInbound) return false;
    const hoursSince = (Date.now() - new Date(lastInbound.created_at).getTime()) / (1000 * 60 * 60);
    return hoursSince < 24;
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || sending) return;

    setSending(true);
    setError(null);

    try {
      await onSend(text.trim());
      setText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setSending(false);
    }
  };

  if (!isWindowOpen) {
    return (
      <div className="px-4 py-3 border-t border-gray-100 bg-gray-50">
        <p className="text-xs text-gray-500 text-center">
          24-hour messaging window has closed. Use a template message to re-engage this guest.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="px-4 py-3 border-t border-gray-100">
      {error && (
        <p className="text-xs text-red-500 mb-2">{error}</p>
      )}
      <div className="flex gap-2">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a reply..."
          disabled={sending}
          className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-200 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#2D4A3E]/20 focus:border-[#2D4A3E] disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!text.trim() || sending}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-[#2D4A3E] text-white hover:bg-[#1E3329] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {sending ? "..." : "Send"}
        </button>
      </div>
    </form>
  );
}
