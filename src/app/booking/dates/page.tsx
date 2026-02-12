"use client";

import { Suspense, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import BookingCalendar from "@/components/BookingCalendar";

function LoadingSkeleton() {
  return (
    <div className="min-h-[100dvh] bg-[#ECE5DD] flex items-center justify-center">
      <div className="w-8 h-8 border-3 border-[#075E54] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export default function DatePickerPage() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <DatePickerInner />
    </Suspense>
  );
}

function DatePickerInner() {
  const params = useSearchParams();
  const hotel = params.get("hotel") || "";
  const phone = params.get("phone") || "";
  const room = params.get("room") || "";
  const count = params.get("count") || "1";
  const guests = params.get("guests") || "";
  const sim = params.get("sim") === "1";

  const isPathA = !room;

  const [activeField, setActiveField] = useState<"checkin" | "checkout">("checkin");
  const [checkIn, setCheckIn] = useState<Date | null>(null);
  const [checkOut, setCheckOut] = useState<Date | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [whatsappNumber, setWhatsappNumber] = useState<string | null>(null);

  const nights =
    checkIn && checkOut
      ? Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

  const handleDateSelect = useCallback(
    (date: Date) => {
      if (activeField === "checkin") {
        setCheckIn(date);
        setCheckOut(null);
        setActiveField("checkout");
        setError("");
      } else {
        // Selecting checkout
        if (checkIn && date <= checkIn) {
          // Tapped same or earlier date — reset to new check-in
          setCheckIn(date);
          setCheckOut(null);
          setActiveField("checkout");
        } else {
          setCheckOut(date);
          setError("");
        }
      }
    },
    [activeField, checkIn],
  );

  const handlePillTap = (field: "checkin" | "checkout") => {
    if (field === "checkin") {
      // Reset both dates
      setCheckIn(null);
      setCheckOut(null);
      setActiveField("checkin");
      setError("");
    } else if (checkIn) {
      // Only allow switching to checkout if check-in is set
      setCheckOut(null);
      setActiveField("checkout");
      setError("");
    }
  };

  const toDateString = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const formatPill = (d: Date | null, placeholder: string) => {
    if (!d) return placeholder;
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  };

  async function handleSubmit() {
    if (!checkIn || !checkOut) return;
    setError("");
    setSubmitting(true);

    try {
      const res = await fetch("/api/booking/dates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotel,
          phone,
          checkIn: toDateString(checkIn),
          checkOut: toDateString(checkOut),
          ...(room
            ? { room, count: parseInt(count) }
            : { guests: parseInt(guests) || 1 }),
          ...(sim ? { sim: true } : {}),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        return;
      }

      setWhatsappNumber(data.whatsapp_number || null);
      setSuccess(true);

      // Auto-redirect after brief delay
      if (sim) {
        // Simulator mode: close tab (works for target="_blank" tabs)
        setTimeout(() => window.close(), 1200);
      } else if (data.whatsapp_number) {
        // Real mode: redirect to WhatsApp
        setTimeout(() => {
          const num = data.whatsapp_number.replace(/^\+/, "");
          window.location.href = `https://wa.me/${num}`;
        }, 1200);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Success overlay ──
  if (success) {
    return (
      <div className="min-h-[100dvh] bg-[#25D366] flex flex-col items-center justify-center p-6 text-white text-center">
        <div className="animate-check-pop mb-4">
          <svg width="72" height="72" viewBox="0 0 72 72" fill="none">
            <circle cx="36" cy="36" r="36" fill="white" fillOpacity="0.2" />
            <path
              d="M22 36L32 46L50 28"
              stroke="white"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-bold mb-2">Dates Confirmed!</h1>
        <p className="text-white/80 text-sm">
          {whatsappNumber
            ? isPathA
              ? "Sending you back to WhatsApp to choose your room..."
              : "Sending you back to WhatsApp to continue..."
            : isPathA
              ? "Head back to WhatsApp to choose your room."
              : "Head back to WhatsApp to continue your booking."}
        </p>
      </div>
    );
  }

  // ── Main page ──
  return (
    <div className="min-h-[100dvh] bg-[#ECE5DD] flex flex-col">
      {/* Header */}
      <div className="bg-[#075E54] pt-[env(safe-area-inset-top)] px-4 pb-4">
        <h1 className="text-white text-lg font-semibold mt-3 mb-3">Select Dates</h1>

        {/* Date pills */}
        <div className="flex gap-2">
          <button
            onClick={() => handlePillTap("checkin")}
            className={`flex-1 rounded-full px-4 py-2.5 text-sm font-medium text-center transition-colors ${
              activeField === "checkin"
                ? "bg-white text-[#075E54]"
                : "bg-white/20 text-white/80"
            }`}
          >
            <span className="block text-[10px] uppercase tracking-wider opacity-70 mb-0.5">
              Check-in
            </span>
            {formatPill(checkIn, "Select date")}
          </button>
          <button
            onClick={() => handlePillTap("checkout")}
            className={`flex-1 rounded-full px-4 py-2.5 text-sm font-medium text-center transition-colors ${
              activeField === "checkout"
                ? "bg-white text-[#075E54]"
                : "bg-white/20 text-white/80"
            }`}
          >
            <span className="block text-[10px] uppercase tracking-wider opacity-70 mb-0.5">
              Check-out
            </span>
            {formatPill(checkOut, "Select date")}
          </button>
        </div>
      </div>

      {/* Calendar */}
      <div className="flex-1 flex flex-col justify-start pt-4 pb-24">
        <BookingCalendar
          activeField={activeField}
          checkIn={checkIn}
          checkOut={checkOut}
          onDateSelect={handleDateSelect}
        />

        {/* Error */}
        {error && (
          <div className="mx-4 mt-3 px-4 py-2.5 bg-red-50 border border-red-200 rounded-xl">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 px-4 py-3 pb-safe flex items-center justify-between">
        <div className="text-sm text-gray-600">
          {nights > 0 ? (
            <span className="font-medium text-gray-900">
              {nights} night{nights > 1 ? "s" : ""}
            </span>
          ) : (
            <span className="text-gray-400">
              {activeField === "checkin" ? "Pick check-in" : "Pick check-out"}
            </span>
          )}
        </div>
        <button
          onClick={handleSubmit}
          disabled={!checkIn || !checkOut || submitting}
          className="bg-[#25D366] hover:bg-[#20bd5a] active:bg-[#1da851] text-white rounded-full px-6 py-2.5 text-sm font-semibold transition-colors disabled:opacity-40 disabled:pointer-events-none min-w-[100px] flex items-center justify-center"
        >
          {submitting ? (
            <span className="flex gap-1 items-center">
              <span className="wa-dot" />
              <span className="wa-dot" />
              <span className="wa-dot" />
            </span>
          ) : (
            "Select"
          )}
        </button>
      </div>
    </div>
  );
}
