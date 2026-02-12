"use client";

import { useState, useRef, useEffect, useCallback } from "react";

// --- Types ---

interface SimulatorMessage {
  type: string;
  to: string;
  body: Record<string, unknown>;
}

interface ChatMessage {
  id: string;
  role: "user" | "bot";
  content: ParsedMessage;
}

interface ParsedMessage {
  type: "text" | "buttons" | "list" | "cta_url" | "image" | "location" | "user_text" | "user_action";
  text: string;
  headerText?: string;
  buttons?: { id: string; title: string }[];
  listButtonLabel?: string;
  sections?: { title: string; rows: { id: string; title: string; description?: string }[] }[];
  ctaUrl?: string;
  ctaButtonText?: string;
  imageUrl?: string;
  imageCaption?: string;
  location?: { latitude: number; longitude: number; name: string; address: string };
}

// --- WhatsApp text formatting ---

function formatWhatsAppText(text: string): string {
  return text
    .replace(/\*([^*]+)\*/g, "<strong>$1</strong>")
    .replace(/_([^_]+)_/g, "<em>$1</em>")
    .replace(/~([^~]+)~/g, "<s>$1</s>")
    .replace(/\n/g, "<br/>");
}

// --- DB message shape (from chat_messages table) ---

interface DbMessage {
  id: string;
  direction: "inbound" | "outbound";
  message_type: string;
  body: string | null;
  raw_payload: Record<string, unknown>;
  created_at: string;
}

function dbMessageToParsed(msg: DbMessage): ParsedMessage {
  const raw = msg.raw_payload;

  // Interactive list
  if (msg.message_type === "interactive_list" && raw?.sections) {
    return {
      type: "list",
      text: msg.body ?? "",
      headerText: raw.headerText as string | undefined,
      listButtonLabel: raw.buttonLabel as string | undefined,
      sections: raw.sections as ParsedMessage["sections"],
    };
  }

  // Interactive buttons
  if (msg.message_type === "interactive_buttons" && raw?.buttons) {
    return {
      type: "buttons",
      text: msg.body ?? "",
      headerText: raw.headerText as string | undefined,
      buttons: raw.buttons as ParsedMessage["buttons"],
    };
  }

  // CTA URL
  if (msg.message_type === "interactive_cta_url" && raw?.url) {
    return {
      type: "cta_url",
      text: msg.body ?? "",
      headerText: raw.headerText as string | undefined,
      ctaButtonText: raw.buttonText as string | undefined,
      ctaUrl: raw.url as string,
    };
  }

  // Default: plain text
  return { type: "text", text: msg.body ?? "" };
}

// --- Parse bot response into renderable format ---

function parseBotMessage(msg: SimulatorMessage): ParsedMessage | null {
  const body = msg.body;

  // Skip status messages (markAsRead)
  if (body.status) return null;

  if (body.type === "text") {
    const text = body.text as { body: string };
    return { type: "text", text: text.body };
  }

  if (body.type === "interactive") {
    const interactive = body.interactive as Record<string, unknown>;
    const interactiveType = interactive.type as string;
    const bodyObj = interactive.body as { text: string };
    const headerObj = interactive.header as { text: string } | undefined;
    const action = interactive.action as Record<string, unknown>;

    if (interactiveType === "button") {
      const buttons = (action.buttons as { reply: { id: string; title: string } }[]).map(
        (b) => b.reply
      );
      return {
        type: "buttons",
        text: bodyObj.text,
        headerText: headerObj?.text,
        buttons,
      };
    }

    if (interactiveType === "list") {
      const sections = action.sections as {
        title: string;
        rows: { id: string; title: string; description?: string }[];
      }[];
      return {
        type: "list",
        text: bodyObj.text,
        headerText: headerObj?.text,
        listButtonLabel: action.button as string,
        sections,
      };
    }

    if (interactiveType === "cta_url") {
      const params = (action as { parameters: { display_text: string; url: string } }).parameters;
      return {
        type: "cta_url",
        text: bodyObj.text,
        headerText: headerObj?.text,
        ctaButtonText: params.display_text,
        ctaUrl: params.url,
      };
    }
  }

  if (body.type === "image") {
    const image = body.image as { link: string; caption?: string };
    return { type: "image", text: image.caption || "", imageUrl: image.link, imageCaption: image.caption };
  }

  if (body.type === "location") {
    const loc = body.location as { latitude: number; longitude: number; name: string; address: string };
    return { type: "location", text: `${loc.name} - ${loc.address}`, location: loc };
  }

  return null;
}

// --- Components ---

function BotBubble({
  msg,
  onButtonClick,
  onListSelect,
  onCtaClick,
}: {
  msg: ParsedMessage;
  onButtonClick: (id: string, title: string) => void;
  onListSelect: (id: string, title: string, description?: string, sectionTitle?: string) => void;
  onCtaClick?: () => void;
}) {
  const [listOpen, setListOpen] = useState(false);

  return (
    <div className="flex justify-start mb-3">
      <div className="max-w-[85%]">
        <div className="bg-white rounded-lg rounded-tl-none shadow-sm border border-gray-100 px-3 py-2">
          {msg.headerText && (
            <p className="text-xs font-bold text-gray-700 mb-1">{msg.headerText}</p>
          )}
          <p
            className="text-sm text-gray-900 whitespace-pre-wrap"
            dangerouslySetInnerHTML={{ __html: formatWhatsAppText(msg.text) }}
          />
        </div>

        {/* Reply buttons */}
        {msg.type === "buttons" && msg.buttons && (
          <div className="mt-1 space-y-1">
            {msg.buttons.map((btn) => (
              <button
                key={btn.id}
                onClick={() => onButtonClick(btn.id, btn.title)}
                className="w-full text-center text-sm font-medium text-[#2D4A3E] bg-white border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50 transition-colors"
              >
                {btn.title}
              </button>
            ))}
          </div>
        )}

        {/* List selector */}
        {msg.type === "list" && msg.sections && (
          <div className="mt-1 relative">
            <button
              onClick={() => setListOpen(!listOpen)}
              className="w-full text-center text-sm font-medium text-[#2D4A3E] bg-white border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50 transition-colors"
            >
              {msg.listButtonLabel || "Select"} {listOpen ? "▲" : "▼"}
            </button>
            {listOpen && (
              <div className="absolute bottom-full left-0 right-0 mb-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-64 overflow-y-auto">
                {msg.sections.map((section) => (
                  <div key={section.title}>
                    <div className="px-3 py-1.5 text-xs font-bold text-gray-500 uppercase bg-gray-50">
                      {section.title}
                    </div>
                    {section.rows.map((row) => (
                      <button
                        key={row.id}
                        onClick={() => {
                          onListSelect(row.id, row.title, row.description, section.title);
                          setListOpen(false);
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-50 last:border-0"
                      >
                        <span className="text-sm font-medium text-gray-900">{row.title}</span>
                        {row.description && (
                          <span className="block text-xs text-gray-500">{row.description}</span>
                        )}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* CTA URL button */}
        {msg.type === "cta_url" && msg.ctaUrl && (
          <div className="mt-1">
            <a
              href={msg.ctaUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onCtaClick}
              className="block w-full text-center text-sm font-medium text-blue-600 bg-white border border-gray-200 rounded-lg px-3 py-2 hover:bg-blue-50 transition-colors"
            >
              {msg.ctaButtonText || "Open Link"} ↗
            </a>
          </div>
        )}

        {/* Image */}
        {msg.type === "image" && msg.imageUrl && (
          <div className="mt-1">
            <div className="bg-white rounded-lg overflow-hidden border border-gray-100">
              <div className="bg-gray-100 px-3 py-6 text-center text-xs text-gray-400">
                [Image: {msg.imageUrl}]
              </div>
              {msg.imageCaption && (
                <p className="px-3 py-1 text-xs text-gray-600">{msg.imageCaption}</p>
              )}
            </div>
          </div>
        )}

        {/* Location */}
        {msg.type === "location" && msg.location && (
          <div className="mt-1">
            <div className="bg-white rounded-lg border border-gray-100 px-3 py-2">
              <p className="text-xs font-bold text-gray-700">{msg.location.name}</p>
              <p className="text-xs text-gray-500">{msg.location.address}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function UserBubble({ msg }: { msg: ParsedMessage }) {
  return (
    <div className="flex justify-end mb-3">
      <div className="max-w-[85%] bg-[#dcf8c6] rounded-lg rounded-tr-none shadow-sm px-3 py-2">
        <p className="text-sm text-gray-900">{msg.text}</p>
      </div>
    </div>
  );
}

// --- Main Chat Component ---

let idCounter = 0;
function genId() {
  return `msg_${Date.now()}_${++idCounter}`;
}

export function SimulatorChat({ hotelName }: { hotelName: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [phone, setPhone] = useState("233999000001");
  const [guestName, setGuestName] = useState("Test Guest");
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const pollStartTime = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Poll for new messages (e.g., after CTA URL click opens external page)
  useEffect(() => {
    if (!polling || !conversationId) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/admin/chats/conversations/${conversationId}/messages?limit=10`);
        if (!res.ok) return;
        const { messages: dbMsgs } = await res.json() as { messages: DbMessage[] };
        // Find outbound bot messages created after polling started
        const newMsgs = dbMsgs.filter(
          (m) => m.direction === "outbound" && m.created_at > (pollStartTime.current ?? "")
        );
        if (newMsgs.length > 0) {
          const parsed: ChatMessage[] = newMsgs.map((m) => ({
            id: m.id,
            role: "bot" as const,
            content: dbMessageToParsed(m),
          }));
          setMessages((prev) => [...prev, ...parsed]);
          setPolling(false);
        }
      } catch {
        // Polling error — silently retry
      }
    }, 1500);
    return () => clearInterval(interval);
  }, [polling, conversationId]);

  const sendToSimulator = useCallback(
    async (payload: Record<string, unknown>, userLabel: string) => {
      // Add user message to chat
      const userMsg: ChatMessage = {
        id: genId(),
        role: "user",
        content: { type: "user_text", text: userLabel },
      };
      setMessages((prev) => [...prev, userMsg]);
      setLoading(true);

      try {
        const res = await fetch("/api/admin/simulator", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone, senderName: guestName, ...payload }),
        });

        if (!res.ok) {
          const err = await res.json();
          setMessages((prev) => [
            ...prev,
            { id: genId(), role: "bot", content: { type: "text", text: `Error: ${err.error || res.statusText}` } },
          ]);
          return;
        }

        const data = (await res.json()) as { messages: SimulatorMessage[]; conversationId?: string };
        const botMsgs = data.messages;
        if (data.conversationId) setConversationId(data.conversationId);

        const parsed: ChatMessage[] = botMsgs
          .map((m) => parseBotMessage(m))
          .filter((m): m is ParsedMessage => m !== null)
          .map((content) => ({ id: genId(), role: "bot" as const, content }));

        setMessages((prev) => [...prev, ...parsed]);
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          { id: genId(), role: "bot", content: { type: "text", text: `Network error: ${err}` } },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [phone, guestName]
  );

  function handleSend() {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    sendToSimulator({ text }, text);
  }

  function handleButtonClick(id: string, title: string) {
    if (loading) return;
    sendToSimulator({ buttonReplyId: id, buttonReplyTitle: title }, title);
  }

  function handleListSelect(id: string, title: string, description?: string, sectionTitle?: string) {
    if (loading) return;
    const label = sectionTitle ? `${sectionTitle} — ${title}` : title;
    sendToSimulator({ listReplyId: id, listReplyTitle: title, listReplyDescription: description }, label);
  }

  async function handleReset() {
    if (loading) return;
    setLoading(true);
    try {
      await fetch("/api/admin/simulator/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full max-w-2xl mx-auto border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
      {/* Header */}
      <div className="bg-[#1a1a2e] px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-white font-semibold text-sm">{hotelName}</p>
          <p className="text-gray-400 text-xs">Simulator Mode</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-32 text-xs bg-white/10 text-white rounded px-2 py-1 placeholder-gray-400"
            placeholder="Phone"
          />
          <input
            type="text"
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            className="w-24 text-xs bg-white/10 text-white rounded px-2 py-1 placeholder-gray-400"
            placeholder="Name"
          />
          <button
            onClick={handleReset}
            disabled={loading}
            className="text-xs text-gray-300 hover:text-white bg-white/10 rounded px-2 py-1 transition-colors disabled:opacity-50"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 bg-[#e5ddd5] min-h-0">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-gray-500 bg-white/80 rounded-lg px-4 py-2">
              Type a message to start the conversation
            </p>
          </div>
        )}
        {messages.map((msg) =>
          msg.role === "user" ? (
            <UserBubble key={msg.id} msg={msg.content} />
          ) : (
            <BotBubble
              key={msg.id}
              msg={msg.content}
              onButtonClick={handleButtonClick}
              onListSelect={handleListSelect}
              onCtaClick={() => {
                pollStartTime.current = new Date().toISOString();
                setPolling(true);
              }}
            />
          )
        )}
        {loading && (
          <div className="flex justify-start mb-3">
            <div className="bg-white rounded-lg rounded-tl-none shadow-sm border border-gray-100 px-4 py-2">
              <span className="text-sm text-gray-400">typing...</span>
            </div>
          </div>
        )}
        <div ref={scrollRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 bg-gray-50 px-4 py-3 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
          placeholder="Type a message..."
          disabled={loading}
          className="flex-1 text-sm rounded-full border border-gray-300 px-4 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#2D4A3E]/30 focus:border-[#2D4A3E] disabled:opacity-50"
        />
        <button
          onClick={handleSend}
          disabled={loading || !input.trim()}
          className="bg-[#2D4A3E] hover:bg-[#1E3329] text-white rounded-full px-5 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Send
        </button>
      </div>
    </div>
  );
}
