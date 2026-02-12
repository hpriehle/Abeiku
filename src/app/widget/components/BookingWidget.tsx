"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "./cn";
import { useCurrency } from "./CurrencyContext";
import { Calendar } from "./Calendar";
import { Button } from "./Button";
import type { WidgetRoom, WidgetHotel } from "../types";

interface BookingWidgetProps {
  room: WidgetRoom;
  hotel: WidgetHotel;
  variant?: "light" | "dark";
}

function formatDateDisplay(dateStr: string): string {
  if (!dateStr) return "";
  const date = new Date(dateStr + "T12:00:00");
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatDateFull(dateStr: string): string {
  const date = new Date(dateStr + "T12:00:00");
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function BookingWidget({ room, hotel, variant = "light" }: BookingWidgetProps) {
  const [selectedTier, setSelectedTier] = useState(0);
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [calendarOpen, setCalendarOpen] = useState(false);
  const { formatPrice } = useCurrency();
  const calendarRef = useRef<HTMLDivElement>(null);

  const tier = room.pricingTiers[selectedTier];
  const isDark = variant === "dark";

  useEffect(() => {
    if (!calendarOpen) return;

    function handleClickOutside(e: MouseEvent) {
      if (
        calendarRef.current &&
        !calendarRef.current.contains(e.target as Node)
      ) {
        setCalendarOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [calendarOpen]);

  function getWhatsAppUrl() {
    let message = `Hello, I'd like to book ${tier.label} at ${hotel.name}`;

    if (checkIn && checkOut) {
      message += ` from ${formatDateFull(checkIn)} to ${formatDateFull(checkOut)}`;
    }

    message += `. (${formatPrice(tier.price)}/night)`;

    const phone = hotel.whatsappPhone?.replace(/\D/g, "") ?? "";
    return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  }

  if (!tier) return null;

  return (
    <div
      className={cn(
        "w-full rounded-lg p-6 md:p-8",
        isDark
          ? "border border-white/10 bg-white/5 backdrop-blur-xl"
          : "border border-gray-light bg-white"
      )}
    >
      {/* Room selector */}
      {room.pricingTiers.length > 1 && (
        <div>
          <span
            className={cn(
              "block font-body text-[10px] font-medium uppercase tracking-[0.2em]",
              isDark ? "text-cream/50" : "text-gray"
            )}
          >
            Rooms
          </span>

          <div className="mt-3 flex gap-4 sm:gap-6">
            {room.pricingTiers.map((t, i) => (
              <button
                key={t.rooms}
                onClick={() => setSelectedTier(i)}
                className={cn(
                  "border-b-2 pb-1 font-body text-small font-medium transition-all duration-200",
                  selectedTier === i
                    ? isDark
                      ? "border-cream text-cream"
                      : "border-green text-black"
                    : cn(
                        "border-transparent",
                        isDark
                          ? "text-cream/40 hover:text-cream/70"
                          : "text-gray hover:text-black"
                      )
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <p className={room.pricingTiers.length > 1 ? "mt-3" : ""}>
        <span
          className={cn(
            "font-heading text-h3 font-light",
            isDark ? "text-cream" : "text-green"
          )}
        >
          {formatPrice(tier.price)}
        </span>
        <span
          className={cn(
            "ml-1.5 font-body text-xs",
            isDark ? "text-cream/40" : "text-gray"
          )}
        >
          / night
        </span>
      </p>

      {/* Divider */}
      <div
        className={cn(
          "my-6 border-t",
          isDark ? "border-white/10" : "border-gray-light"
        )}
      />

      {/* Date selector */}
      <div ref={calendarRef} className="relative">
        <span
          className={cn(
            "block font-body text-[10px] font-medium uppercase tracking-[0.2em]",
            isDark ? "text-cream/50" : "text-gray"
          )}
        >
          Dates
        </span>

        <button
          onClick={() => setCalendarOpen(!calendarOpen)}
          className={cn(
            "mt-2 flex w-full items-center justify-between border-b py-2 text-left font-body text-small transition-colors",
            isDark
              ? "border-cream/20 hover:border-cream/40"
              : "border-gray-light hover:border-green/40",
            calendarOpen &&
              (isDark ? "border-cream/50" : "border-green")
          )}
        >
          <span
            className={cn(
              checkIn
                ? isDark
                  ? "text-cream"
                  : "text-black"
                : isDark
                  ? "text-cream/30"
                  : "text-gray/50"
            )}
          >
            {checkIn && checkOut
              ? `${formatDateDisplay(checkIn)} — ${formatDateDisplay(checkOut)}`
              : checkIn
                ? `${formatDateDisplay(checkIn)} — Select check-out`
                : "Select dates"}
          </span>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className={cn(
              "transition-transform duration-200",
              isDark ? "text-cream/40" : "text-gray",
              calendarOpen && "rotate-180"
            )}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {calendarOpen && (
          <div className="absolute left-0 right-0 z-50 mt-2">
            <Calendar
              variant={variant}
              checkIn={checkIn}
              checkOut={checkOut}
              onSelectCheckIn={setCheckIn}
              onSelectCheckOut={setCheckOut}
              onClose={() => setCalendarOpen(false)}
              hotelSlug={hotel.slug}
              roomSlug={room.slug}
            />
          </div>
        )}
      </div>

      {/* Divider */}
      <div
        className={cn(
          "my-6 border-t",
          isDark ? "border-white/10" : "border-gray-light"
        )}
      />

      {/* CTA */}
      <div>
        {hotel.whatsappPhone ? (
          <a
            href={getWhatsAppUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "inline-flex w-full items-center justify-center rounded px-8 py-3.5 font-body text-small font-medium uppercase tracking-wide transition-all duration-300 focus-visible:outline-2 focus-visible:outline-offset-2",
              isDark
                ? "bg-cream text-black hover:bg-white focus-visible:outline-cream"
                : "bg-green text-white hover:bg-green-light focus-visible:outline-green"
            )}
          >
            Book on WhatsApp
          </a>
        ) : (
          <p className={cn(
            "text-center font-body text-small",
            isDark ? "text-cream/50" : "text-gray"
          )}>
            Contact hotel to book
          </p>
        )}
        {room.airbnbUrl && (
          <Button
            href={room.airbnbUrl}
            external
            target="_blank"
            rel="noopener noreferrer"
            variant={isDark ? "dark" : "outline"}
            size="sm"
            className="mt-3 w-full"
          >
            View on Airbnb
          </Button>
        )}
      </div>
    </div>
  );
}
