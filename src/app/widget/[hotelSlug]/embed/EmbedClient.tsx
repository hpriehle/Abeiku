"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "../../components/cn";
import { Calendar } from "../../components/Calendar";
import { CurrencyProvider } from "../../components/CurrencyContext";
import { CurrencyToggle } from "../../components/CurrencyToggle";
import { HeightReporter } from "../../components/HeightReporter";
import { useCurrency } from "../../components/CurrencyContext";
import type { WidgetRoom, WidgetHotel } from "../../types";

interface EmbedClientProps {
  rooms: WidgetRoom[];
  hotel: WidgetHotel;
}

export function EmbedClient({ rooms, hotel }: EmbedClientProps) {
  return (
    <CurrencyProvider baseCurrency={hotel.currency as "USD" | "GHS"}>
      <div className="mx-auto max-w-md bg-white">
        <HeightReporter />
        {rooms.length === 0 ? (
          <div className="p-8 text-center">
            <p className="font-body text-body text-gray">No rooms available yet.</p>
          </div>
        ) : (
          <BookingFlow rooms={rooms} hotel={hotel} />
        )}
      </div>
    </CurrencyProvider>
  );
}

// --- Helpers ---

function toDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDateDisplay(dateStr: string): string {
  if (!dateStr) return "";
  const date = new Date(dateStr + "T12:00:00");
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatDateFull(dateStr: string): string {
  const date = new Date(dateStr + "T12:00:00");
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function nightsBetween(checkIn: string, checkOut: string): number {
  const a = new Date(checkIn + "T12:00:00");
  const b = new Date(checkOut + "T12:00:00");
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

// --- Main Booking Flow ---

function BookingFlow({ rooms, hotel }: { rooms: WidgetRoom[]; hotel: WidgetHotel }) {
  const { formatPrice } = useCurrency();

  // State
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [selectingField, setSelectingField] = useState<"checkIn" | "checkOut" | null>(null);
  const calendarOpen = selectingField !== null;
  const [guests, setGuests] = useState(2);
  const [selectedSlugs, setSelectedSlugs] = useState<Set<string>>(new Set());
  const [availabilityByRoom, setAvailabilityByRoom] = useState<Record<string, Set<string>>>({});

  const maxGuests = useMemo(
    () => Math.max(...rooms.map((r) => r.occupancy)),
    [rooms]
  );

  const nights = checkIn && checkOut ? nightsBetween(checkIn, checkOut) : 0;

  const selectedRooms = rooms.filter((r) => selectedSlugs.has(r.slug));
  const totalPrice = nights > 0
    ? selectedRooms.reduce((sum, r) => sum + (r.pricingTiers[0]?.price ?? 0) * nights, 0)
    : 0;

  // Pre-fetch availability for next 90 days on mount
  useEffect(() => {
    const today = new Date();
    const start = toDateStr(today);
    const end = toDateStr(new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000));

    const fetchAll = async () => {
      const results: Record<string, Set<string>> = {};
      await Promise.all(
        rooms.map(async (room) => {
          try {
            const params = new URLSearchParams({ start, end, roomSlug: room.slug });
            const res = await fetch(`/api/widget/${hotel.slug}/availability?${params}`);
            const data = await res.json();
            results[room.slug] = new Set(data.bookedDates ?? []);
          } catch {
            results[room.slug] = new Set();
          }
        })
      );
      setAvailabilityByRoom(results);
    };

    fetchAll();
  }, [hotel.slug, rooms]);

  // Check if a room is available for the selected date range
  const isRoomAvailable = useCallback(
    (roomSlug: string): boolean => {
      const booked = availabilityByRoom[roomSlug];
      if (!booked || booked.size === 0) return true;
      // Check if any date in the range is booked
      const current = new Date(checkIn + "T12:00:00");
      const end = new Date(checkOut + "T12:00:00");
      while (current < end) {
        const y = current.getFullYear();
        const m = String(current.getMonth() + 1).padStart(2, "0");
        const d = String(current.getDate()).padStart(2, "0");
        if (booked.has(`${y}-${m}-${d}`)) return false;
        current.setDate(current.getDate() + 1);
      }
      return true;
    },
    [availabilityByRoom, checkIn, checkOut]
  );

  // Sort rooms by price
  const sortedRooms = useMemo(() => {
    return [...rooms].sort((a, b) =>
      (a.pricingTiers[0]?.price ?? 0) - (b.pricingTiers[0]?.price ?? 0)
    );
  }, [rooms]);

  const individualRooms = useMemo(() => rooms.filter((r) => r.roomType !== "group"), [rooms]);
  const groupRoom = useMemo(() => rooms.find((r) => r.roomType === "group"), [rooms]);

  // Room selection with group/individual mutual exclusivity
  function toggleRoom(room: WidgetRoom) {
    setSelectedSlugs((prev) => {
      if (room.roomType === "group") {
        // Clicking group room: toggle it, clear individuals
        return prev.has(room.slug) ? new Set() : new Set([room.slug]);
      }
      // Clicking individual room: clear any group selection
      const next = new Set(Array.from(prev).filter((s) => {
        const r = rooms.find((rm) => rm.slug === s);
        return r && r.roomType !== "group";
      }));
      if (next.has(room.slug)) {
        next.delete(room.slug);
      } else {
        next.add(room.slug);
      }
      // If all individual rooms selected, auto-switch to group room
      if (groupRoom && individualRooms.every((r) => next.has(r.slug))) {
        return new Set([groupRoom.slug]);
      }
      return next;
    });
  }

  // WhatsApp URL
  function getWhatsAppUrl(): string {
    if (selectedRooms.length === 0) return "#";
    let message = `Hello, I'd like to book at ${hotel.name} for ${guests} guest${guests > 1 ? "s" : ""}.`;
    for (const room of selectedRooms) {
      const tier = room.pricingTiers[0];
      if (tier) message += `\n- ${room.name} (${formatPrice(tier.price)}/night)`;
    }
    if (checkIn && checkOut) {
      message += `\nCheck-in: ${formatDateFull(checkIn)}`;
      message += `\nCheck-out: ${formatDateFull(checkOut)}`;
      message += `\n${nights} night${nights > 1 ? "s" : ""} — ${formatPrice(totalPrice)} total`;
    }
    const phone = hotel.whatsappPhone?.replace(/\D/g, "") ?? "";
    return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  }

  const canBook = checkIn && checkOut && selectedSlugs.size > 0;

  return (
    <div className="rounded-lg border border-gray-light p-6 md:p-8">
      {/* Currency toggle */}
      <div className="mb-6 flex justify-end">
        <CurrencyToggle />
      </div>

      {/* DATES */}
      <span className="block font-body text-[10px] font-medium uppercase tracking-[0.2em] text-gray">
        Dates
      </span>
      <div className="mt-2 flex gap-3">
        <button
          onClick={() => {
            if (selectingField === "checkIn") {
              setSelectingField(null);
            } else {
              setCheckIn("");
              setCheckOut("");
              setSelectedSlugs(new Set());
              setSelectingField("checkIn");
            }
          }}
          className={cn(
            "flex-1 rounded border px-3 py-2.5 text-left font-body text-small transition-colors",
            selectingField === "checkIn"
              ? "border-green ring-2 ring-green bg-green/5 text-black"
              : checkIn
                ? "border-green bg-green/5 text-black"
                : "border-gray-light text-gray/50 hover:border-green/40"
          )}
        >
          {checkIn ? formatDateDisplay(checkIn) : "Check-in"}
        </button>
        <button
          onClick={() => {
            if (selectingField === "checkOut") {
              setSelectingField(null);
            } else if (checkIn) {
              setSelectingField("checkOut");
            } else {
              setSelectingField("checkIn");
            }
          }}
          className={cn(
            "flex-1 rounded border px-3 py-2.5 text-left font-body text-small transition-colors",
            selectingField === "checkOut"
              ? "border-green ring-2 ring-green bg-green/5 text-black"
              : checkOut
                ? "border-green bg-green/5 text-black"
                : "border-gray-light text-gray/50 hover:border-green/40"
          )}
        >
          {checkOut ? formatDateDisplay(checkOut) : "Check-out"}
        </button>
      </div>

      {/* Calendar (inline) */}
      {calendarOpen && (
        <div className="mt-3">
          <Calendar
            checkIn={checkIn}
            checkOut={checkOut}
            initialSelectingCheckOut={selectingField === "checkOut"}
            onSelectCheckIn={(d) => {
              setCheckIn(d);
              setSelectedSlugs(new Set());
              setSelectingField("checkOut");
            }}
            onSelectCheckOut={(d) => {
              setCheckOut(d);
              setSelectingField(null);
            }}
            onClose={() => setSelectingField(null)}
            hotelSlug={hotel.slug}
          />
        </div>
      )}

      {/* GUESTS */}
      <div className="mt-6">
        <span className="block font-body text-[10px] font-medium uppercase tracking-[0.2em] text-gray">
          Guests
        </span>
        <div className="mt-2 flex items-center gap-4">
          <button
            onClick={() => setGuests((g) => Math.max(1, g - 1))}
            disabled={guests <= 1}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-full border font-body text-body transition-colors",
              guests <= 1
                ? "cursor-not-allowed border-gray-light text-gray/30"
                : "border-gray-light text-black hover:border-green"
            )}
          >
            -
          </button>
          <span className="font-body text-small text-black">
            {guests} {guests === 1 ? "guest" : "guests"}
          </span>
          <button
            onClick={() => setGuests((g) => Math.min(maxGuests, g + 1))}
            disabled={guests >= maxGuests}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-full border font-body text-body transition-colors",
              guests >= maxGuests
                ? "cursor-not-allowed border-gray-light text-gray/30"
                : "border-gray-light text-black hover:border-green"
            )}
          >
            +
          </button>
        </div>
      </div>

      {/* Divider */}
      <div className="my-6 border-t border-gray-light" />

      {/* ROOMS */}
      {checkIn && checkOut ? (
        <>
          <div className="flex items-baseline justify-between">
            <span className="font-body text-[10px] font-medium uppercase tracking-[0.2em] text-gray">
              Available Rooms
            </span>
            <span className="font-body text-xs text-gray">
              {nights} night{nights > 1 ? "s" : ""}
            </span>
          </div>

          <div className="mt-3 space-y-2">
            {sortedRooms.map((room) => {
              const tier = room.pricingTiers[0];
              if (!tier) return null;
              const available = isRoomAvailable(room.slug);
              const isSelected = selectedSlugs.has(room.slug);
              const total = tier.price * nights;

              return (
                <button
                  key={room.slug}
                  onClick={() => available && toggleRoom(room)}
                  disabled={!available}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-all duration-200",
                    !available
                      ? "cursor-not-allowed border-gray-light bg-gray-light/30 opacity-50"
                      : isSelected
                        ? "border-green bg-green/5"
                        : "border-gray-light bg-white hover:border-green/40"
                  )}
                >
                  {/* Checkbox */}
                  <div className={cn(
                    "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors",
                    isSelected ? "border-green bg-green" : "border-gray-light"
                  )}>
                    {isSelected && (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>

                  {/* Room info */}
                  <div className="min-w-0 flex-1">
                    <div className="font-heading text-small font-light text-black">
                      {room.name}
                    </div>
                    <div className="mt-0.5 font-body text-xs text-gray">
                      {room.occupancy} guest{room.occupancy > 1 ? "s" : ""}
                      {room.bedType && ` · ${room.bedType}`}
                    </div>
                    {!available && (
                      <div className="mt-1 font-body text-xs text-red-500">Unavailable for these dates</div>
                    )}
                  </div>

                  {/* Price */}
                  <div className="shrink-0 text-right">
                    <div className="font-heading text-small font-light text-green">
                      {formatPrice(tier.price)}
                    </div>
                    <div className="font-body text-[10px] text-gray">/ night</div>
                    {nights > 0 && (
                      <div className="mt-1 font-body text-xs font-medium text-black">
                        {formatPrice(total)}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Combined total */}
          {selectedSlugs.size > 0 && nights > 0 && (
            <div className="mt-3 flex items-center justify-between rounded bg-green/5 px-3 py-2">
              <span className="font-body text-xs text-gray">
                {selectedSlugs.size} room{selectedSlugs.size > 1 ? "s" : ""} · {nights} night{nights > 1 ? "s" : ""}
              </span>
              <span className="font-heading text-body font-medium text-green">
                {formatPrice(totalPrice)}
              </span>
            </div>
          )}
        </>
      ) : (
        <p className="text-center font-body text-small text-gray/50">
          Select dates to see available rooms
        </p>
      )}

      {/* Divider */}
      <div className="my-6 border-t border-gray-light" />

      {/* CTA */}
      {hotel.whatsappPhone ? (
        <a
          href={canBook ? getWhatsAppUrl() : undefined}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "inline-flex w-full items-center justify-center rounded px-8 py-3.5 font-body text-small font-medium uppercase tracking-wide transition-all duration-300",
            canBook
              ? "bg-green text-white hover:bg-green-light"
              : "cursor-not-allowed bg-gray-light text-gray"
          )}
          onClick={(e) => { if (!canBook) e.preventDefault(); }}
        >
          Book on WhatsApp
        </a>
      ) : (
        <p className="text-center font-body text-small text-gray">
          Contact hotel to book
        </p>
      )}
      {(selectedRooms.find((r) => r.airbnbUrl)?.airbnbUrl ?? rooms.find((r) => r.airbnbUrl)?.airbnbUrl) && (
        <a
          href={(selectedRooms.find((r) => r.airbnbUrl)?.airbnbUrl ?? rooms.find((r) => r.airbnbUrl)?.airbnbUrl) || undefined}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex w-full items-center justify-center rounded border border-green px-8 py-2.5 font-body text-xs font-medium uppercase tracking-wide text-green transition-all duration-300 hover:bg-green hover:text-white"
        >
          View on Airbnb
        </a>
      )}
    </div>
  );
}
