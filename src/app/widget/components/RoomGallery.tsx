"use client";

import { useState } from "react";
import Image from "next/image";
import { Container } from "./Container";
import { SectionHeading } from "./SectionHeading";
import { FadeIn } from "./FadeIn";
import { Lightbox } from "./Lightbox";
import type { WidgetRoom } from "../types";

interface RoomGalleryProps {
  room: WidgetRoom;
}

export function RoomGallery({ room }: RoomGalleryProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const allImages = [
    ...(room.images.hero ? [room.images.hero] : []),
    ...room.images.gallery,
  ];

  if (allImages.length === 0) return null;

  return (
    <>
      <section className="bg-cream-dark py-24 md:py-32">
        <Container>
          <SectionHeading title="Gallery" />

          <FadeIn>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-6">
              {allImages.map((src, i) => (
                <button
                  key={i}
                  onClick={() => setLightboxIndex(i)}
                  className="group relative aspect-square overflow-hidden focus-visible:ring-2 focus-visible:ring-green focus-visible:ring-offset-2"
                >
                  <Image
                    src={src}
                    alt={`${room.name} - Photo ${i + 1}`}
                    fill
                    sizes="(max-width: 768px) 50vw, 25vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-black/0 transition-colors duration-300 group-hover:bg-black/20" />
                </button>
              ))}
            </div>
          </FadeIn>
        </Container>
      </section>

      {lightboxIndex !== null && (
        <Lightbox
          images={allImages}
          initialIndex={lightboxIndex}
          alt={room.name}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </>
  );
}
