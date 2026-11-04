"use client";

import { useState } from "react";

/** Per-hotel switch for the booking bot's automatic replies. */
export function BotToggle({ enabled, isOnBizApp }: { enabled: boolean; isOnBizApp: boolean }) {
  const [on, setOn] = useState(enabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function toggle() {
    const next = !on;
    setSaving(true);
    setError("");
    const res = await fetch("/api/admin/hotel", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ whatsapp_bot_enabled: next }),
    });
    setSaving(false);
    if (res.ok) setOn(next);
    else setError("Couldn't save. Has the WhatsApp database migration been run?");
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">Booking bot auto-replies</h3>
          <p className="text-sm text-gray-500">
            {on
              ? "The bot answers every incoming WhatsApp message automatically."
              : "Incoming messages go to the inbox without an automatic reply."}
            {isOnBizApp && " This number is shared with the WhatsApp Business app, so staff replying from the app would see the bot answer too."}
          </p>
          {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
        </div>
        <button
          onClick={toggle}
          disabled={saving}
          role="switch"
          aria-checked={on}
          className={`relative shrink-0 w-11 h-6 rounded-full transition-colors disabled:opacity-50 ${on ? "bg-[#2D4A3E]" : "bg-gray-300"}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${on ? "translate-x-5" : ""}`} />
        </button>
      </div>
    </div>
  );
}
