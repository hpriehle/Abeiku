"use client";

import { useState } from "react";
import { cn } from "../../components/cn";
import { BookingWidget } from "../../components/BookingWidget";
import { CurrencyToggle } from "../../components/CurrencyToggle";
import { CurrencyProvider } from "../../components/CurrencyContext";
import { HeightReporter } from "../../components/HeightReporter";
import type { WidgetRoom, WidgetHotel } from "../../types";

interface EmbedClientProps {
  rooms: WidgetRoom[];
  hotel: WidgetHotel;
}

export function EmbedClient({ rooms, hotel }: EmbedClientProps) {
  const [selectedRoomIndex, setSelectedRoomIndex] = useState(0);

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

  const selectedRoom = rooms[selectedRoomIndex];

  return (
    <CurrencyProvider baseCurrency={hotel.currency as "USD" | "GHS"}>
      <div className="mx-auto max-w-md px-4 py-6">
        <HeightReporter />

        {/* Header: room tabs (if multiple) + currency toggle */}
        <div className="mb-6 flex items-start justify-between">
          {rooms.length > 1 ? (
            <div className="flex flex-wrap gap-4 sm:gap-6">
              {rooms.map((room, i) => (
                <button
                  key={room.slug}
                  onClick={() => setSelectedRoomIndex(i)}
                  className={cn(
                    "border-b-2 pb-1 font-heading text-h4 font-light transition-all duration-200",
                    selectedRoomIndex === i
                      ? "border-green text-black"
                      : "border-transparent text-gray hover:text-black"
                  )}
                >
                  {room.name}
                </button>
              ))}
            </div>
          ) : (
            <h2 className="font-heading text-h3 font-light">{selectedRoom.name}</h2>
          )}
          <CurrencyToggle />
        </div>

        {/* BookingWidget — identical to Aracuya website */}
        <BookingWidget room={selectedRoom} hotel={hotel} />
      </div>
    </CurrencyProvider>
  );
}
