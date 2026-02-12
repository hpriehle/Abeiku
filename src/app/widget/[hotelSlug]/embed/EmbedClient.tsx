"use client";

import { useState } from "react";
import Image from "next/image";
import { cn } from "../../components/cn";
import { BookingWidget } from "../../components/BookingWidget";
import { CurrencyToggle } from "../../components/CurrencyToggle";
import { HeightReporter } from "../../components/HeightReporter";
import { useCurrency } from "../../components/CurrencyContext";
import type { WidgetRoom, WidgetHotel } from "../../types";

interface EmbedClientProps {
  rooms: WidgetRoom[];
  hotel: WidgetHotel;
}

export function EmbedClient({ rooms, hotel }: EmbedClientProps) {
  const [selectedRoom, setSelectedRoom] = useState<string | null>(
    rooms.length === 1 ? rooms[0].slug : null
  );
  const { formatPrice } = useCurrency();

  if (rooms.length === 0) {
    return (
      <div className="p-8 text-center">
        <p className="font-body text-body text-gray">
          No rooms available yet.
        </p>
        <HeightReporter />
      </div>
    );
  }

  return (
    <div className="px-4 py-6 md:px-6">
      <HeightReporter />

      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h2 className="font-heading text-h3 font-light">Rooms & Rates</h2>
        <CurrencyToggle />
      </div>

      {/* Room cards */}
      <div className="space-y-4">
        {rooms.map((room) => {
          const isSelected = selectedRoom === room.slug;
          const startingPrice = room.pricingTiers[0]?.price;

          return (
            <div key={room.slug}>
              {/* Room card */}
              <button
                onClick={() =>
                  setSelectedRoom(isSelected ? null : room.slug)
                }
                className={cn(
                  "flex w-full items-center gap-4 rounded-lg border p-3 text-left transition-all duration-200 md:gap-6 md:p-4",
                  isSelected
                    ? "border-green bg-white shadow-sm"
                    : "border-gray-light bg-white hover:border-green/40 hover:shadow-sm"
                )}
              >
                {/* Room image */}
                {room.images.hero ? (
                  <div className="relative h-20 w-28 shrink-0 overflow-hidden rounded md:h-24 md:w-36">
                    <Image
                      src={room.images.hero}
                      alt={room.name}
                      fill
                      sizes="144px"
                      className="object-cover"
                    />
                  </div>
                ) : (
                  <div className="h-20 w-28 shrink-0 rounded bg-cream-dark md:h-24 md:w-36" />
                )}

                {/* Room info */}
                <div className="min-w-0 flex-1">
                  <h3 className="font-heading text-h4 font-light leading-tight">
                    {room.name}
                  </h3>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                    {room.bedType && (
                      <span className="font-body text-xs text-gray">
                        {room.bedType}
                      </span>
                    )}
                    <span className="font-body text-xs text-gray">
                      {room.occupancy} {room.occupancy === 1 ? "guest" : "guests"}
                    </span>
                  </div>
                </div>

                {/* Price + arrow */}
                <div className="shrink-0 text-right">
                  {startingPrice != null && (
                    <div>
                      <span className="font-heading text-h4 font-light text-green">
                        {formatPrice(startingPrice)}
                      </span>
                      <span className="block font-body text-[10px] text-gray">
                        / night
                      </span>
                    </div>
                  )}
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className={cn(
                      "mt-1 ml-auto text-gray transition-transform duration-200",
                      isSelected && "rotate-180"
                    )}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>
              </button>

              {/* Expanded booking widget */}
              {isSelected && (
                <div className="mt-3 ml-0 md:ml-[calc(144px+24px)]">
                  <BookingWidget room={room} hotel={hotel} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
