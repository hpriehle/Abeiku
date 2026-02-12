"use client";

import { Container } from "./Container";
import { SectionHeading } from "./SectionHeading";
import { FadeIn } from "./FadeIn";
import type { WidgetRoom } from "../types";

interface RoomAmenitiesProps {
  room: WidgetRoom;
}

export function RoomAmenities({ room }: RoomAmenitiesProps) {
  if (room.amenities.length === 0) return null;

  return (
    <section className="py-24 md:py-32">
      <Container>
        <SectionHeading title="Amenities" />

        <FadeIn>
          <div className="mx-auto grid max-w-3xl grid-cols-2 gap-x-8 gap-y-4 md:grid-cols-3">
            {room.amenities.map((amenity, i) => (
              <div
                key={amenity}
                className="flex items-center gap-3 border-b border-gray-light py-3"
                style={{ transitionDelay: `${i * 0.05}s` }}
              >
                <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-green" />
                <span className="font-body text-small text-black">
                  {amenity}
                </span>
              </div>
            ))}
          </div>
        </FadeIn>
      </Container>
    </section>
  );
}
