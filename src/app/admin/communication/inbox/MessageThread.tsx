"use client";

import { useEffect, useRef } from "react";
import type { ChatMessage } from "@/lib/db";

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

/** Parse WhatsApp-style markdown: *bold*, _italic_, ~strikethrough~, ```mono``` */
function FormattedText({ text }: { text: string }) {
  // Process WhatsApp markdown into React elements
  const parts: React.ReactNode[] = [];
  // Regex matches *bold*, _italic_, ~strike~, ```code``` in order
  const regex = /\*([^*]+)\*|_([^_]+)_|~([^~]+)~|```([^`]+)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // Add plain text before this match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    if (match[1] !== undefined) {
      parts.push(<strong key={match.index}>{match[1]}</strong>);
    } else if (match[2] !== undefined) {
      parts.push(<em key={match.index}>{match[2]}</em>);
    } else if (match[3] !== undefined) {
      parts.push(<s key={match.index}>{match[3]}</s>);
    } else if (match[4] !== undefined) {
      parts.push(<code key={match.index} className="bg-black/5 px-1 rounded text-xs">{match[4]}</code>);
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return <>{parts}</>;
}

export function MessageThread({ messages }: { messages: ChatMessage[] }) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-gray-400">No messages yet</p>
      </div>
    );
  }

  // Group messages by date
  let lastDate = "";

  return (
    <div className="p-4 space-y-3">
      {messages.map((msg) => {
        const msgDate = msg.created_at.split("T")[0];
        const showDate = msgDate !== lastDate;
        lastDate = msgDate;

        const isInbound = msg.direction === "inbound";
        const isAdmin = msg.sender_type === "admin";

        return (
          <div key={msg.id}>
            {showDate && (
              <div className="flex justify-center my-3">
                <span className="text-[10px] text-gray-400 bg-gray-50 px-3 py-1 rounded-full">
                  {formatDate(msg.created_at)}
                </span>
              </div>
            )}

            <div className={`flex ${isInbound ? "justify-start" : "justify-end"}`}>
              <div
                className={`max-w-[75%] rounded-xl px-3 py-2 ${
                  isInbound
                    ? "bg-gray-100 text-gray-900"
                    : isAdmin
                      ? "bg-blue-50 text-gray-900"
                      : "bg-green-50 text-gray-900"
                }`}
              >
                {/* Sender label for admin messages */}
                {isAdmin && (
                  <p className="text-[10px] font-medium text-blue-600 mb-0.5">You</p>
                )}

                {/* Message body */}
                <p className="text-sm whitespace-pre-wrap break-words">
                  {msg.body ? <FormattedText text={msg.body} /> : `[${msg.message_type}]`}
                </p>

                {/* Interactive button chips */}
                {msg.raw_payload &&
                  typeof msg.raw_payload === "object" &&
                  "buttons" in msg.raw_payload &&
                  Array.isArray((msg.raw_payload as { buttons: { title: string }[] }).buttons) && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {(msg.raw_payload as { buttons: { title: string }[] }).buttons.map(
                        (btn: { title: string }, i: number) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 rounded border border-gray-200 text-[10px] text-gray-600"
                          >
                            {btn.title}
                          </span>
                        )
                      )}
                    </div>
                  )}

                {/* Timestamp */}
                <p className={`text-[10px] mt-1 ${isInbound ? "text-gray-400" : "text-gray-400"}`}>
                  {formatTime(msg.created_at)}
                </p>
              </div>
            </div>
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}
