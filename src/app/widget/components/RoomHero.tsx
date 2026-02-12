"use client";

import Image from "next/image";
import type { WidgetRoom } from "../types";

interface RoomHeroProps {
  room: WidgetRoom;
}

export function RoomHero({ room }: RoomHeroProps) {
  if (!room.images.hero) return null;

  return (
    <section className="relative h-[70vh] w-full overflow-hidden">
      <div className="absolute inset-0 z-10 bg-black/40" />

      <Image
        src={room.images.hero}
        alt={`${room.name}${room.bedType ? ` — ${room.bedType.toLowerCase()} bed` : ""}`}
        fill
        priority
        quality={85}
        sizes="100vw"
        className="object-cover"
      />

      <div className="relative z-20 flex h-full flex-col items-center justify-end pb-16 text-center text-cream">
        <h1 className="hero-title font-heading text-h1 font-light tracking-wide md:text-display">
          {room.name}
        </h1>
        {room.tagline && (
          <p className="hero-tagline mt-3 font-body text-body-lg font-light tracking-wide">
            {room.tagline}
          </p>
        )}
      </div>
    </section>
  );
}
