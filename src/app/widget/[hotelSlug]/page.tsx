import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { getHotelBySlug, getHotelRooms } from "@/lib/db";
import { mapHotelRoomToWidgetRoom, mapHotelToWidgetHotel } from "../types";
import { Container } from "../components/Container";
import { FadeIn } from "../components/FadeIn";
import { BookingWidget } from "../components/BookingWidget";
import { CurrencyToggle } from "../components/CurrencyToggle";

interface WidgetPageProps {
  params: Promise<{ hotelSlug: string }>;
}

export default async function WidgetPage({ params }: WidgetPageProps) {
  const { hotelSlug } = await params;

  const hotel = await getHotelBySlug(hotelSlug);
  if (!hotel) notFound();

  const rawRooms = await getHotelRooms(hotel.id);
  const rooms = rawRooms.map(mapHotelRoomToWidgetRoom);
  const widgetHotel = mapHotelToWidgetHotel(hotel);

  if (rooms.length === 0) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Container>
          <div className="text-center">
            <h1 className="font-heading text-h2 font-light">No Rooms Available</h1>
            <p className="mt-4 font-body text-body text-gray">
              {hotel.name} hasn&apos;t added any rooms yet.
            </p>
          </div>
        </Container>
      </main>
    );
  }

  // Single room — show the full Aracuya-style layout
  if (rooms.length === 1) {
    const room = rooms[0];
    return (
      <main>
        <section className="pt-16 pb-24 md:pt-24 md:pb-32">
          <Container>
            <div className="mb-6 flex justify-end">
              <CurrencyToggle />
            </div>

            <div className="text-center">
              <FadeIn>
                <span className="font-body text-xs font-medium uppercase tracking-[0.2em] text-green">
                  Accommodations
                </span>
              </FadeIn>
              <FadeIn delay={0.1}>
                <h1 className="mt-4 font-heading text-h1 font-light">
                  Our Rooms
                </h1>
              </FadeIn>
              {room.description && (
                <FadeIn delay={0.2}>
                  <p className="mx-auto mt-4 max-w-lg font-body text-body-lg font-light text-gray">
                    {room.description}
                  </p>
                </FadeIn>
              )}
            </div>

            <div className="mt-16 grid items-start gap-12 md:grid-cols-2 md:gap-16">
              <FadeIn>
                {room.images.hero ? (
                  <Link
                    href={`/widget/${hotelSlug}/rooms/${room.slug}`}
                    className="group relative block aspect-[4/3] overflow-hidden"
                  >
                    <Image
                      src={room.images.hero}
                      alt={room.name}
                      fill
                      sizes="(max-width: 768px) 100vw, 50vw"
                      className="object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-black/0 transition-colors duration-300 group-hover:bg-black/10" />
                  </Link>
                ) : (
                  <div className="aspect-[4/3] bg-cream-dark" />
                )}

                {room.images.gallery.length > 0 && (
                  <div className="mt-6 grid grid-cols-2 gap-x-8 gap-y-4">
                    {room.images.gallery.slice(0, 2).map((src, i) => (
                      <Link
                        key={i}
                        href={`/widget/${hotelSlug}/rooms/${room.slug}`}
                        className="group relative aspect-square overflow-hidden"
                      >
                        <Image
                          src={src}
                          alt={`${room.name} - Photo ${i + 2}`}
                          fill
                          sizes="(max-width: 768px) 50vw, 25vw"
                          className="object-cover transition-transform duration-700 group-hover:scale-105"
                        />
                      </Link>
                    ))}
                  </div>
                )}
              </FadeIn>

              <FadeIn delay={0.2}>
                <div className="text-center">
                  <Link href={`/widget/${hotelSlug}/rooms/${room.slug}`}>
                    <h2 className="font-heading text-h2 font-light transition-colors duration-300 hover:text-green">
                      {room.name}
                    </h2>
                  </Link>
                  {room.tagline && (
                    <p className="mt-2 font-body text-body font-light text-gray">
                      {room.tagline}
                    </p>
                  )}

                  <div className="mt-4 flex flex-wrap justify-center gap-x-8 gap-y-2">
                    {room.size && (
                      <span className="font-body text-small text-gray">
                        {room.size}
                      </span>
                    )}
                    <span className="font-body text-small text-gray">
                      {room.totalRooms} {room.totalRooms === 1 ? "room" : "rooms"}
                    </span>
                    <span className="font-body text-small text-gray">
                      Up to {room.occupancy * room.totalRooms} guests
                    </span>
                  </div>

                  <div className="mt-8">
                    <BookingWidget room={room} hotel={widgetHotel} />
                  </div>

                  <Link
                    href={`/widget/${hotelSlug}/rooms/${room.slug}`}
                    className="mt-6 inline-flex items-center justify-center rounded border border-green px-5 py-2 font-body text-xs font-medium uppercase tracking-wide text-green transition-all duration-300 hover:bg-green hover:text-white"
                  >
                    View Gallery & Details
                  </Link>
                </div>
              </FadeIn>
            </div>
          </Container>
        </section>
      </main>
    );
  }

  // Multi-room — grid of room cards
  return (
    <main>
      <section className="pt-16 pb-24 md:pt-24 md:pb-32">
        <Container>
          <div className="mb-6 flex justify-end">
            <CurrencyToggle />
          </div>

          <div className="text-center">
            <FadeIn>
              <span className="font-body text-xs font-medium uppercase tracking-[0.2em] text-green">
                Accommodations
              </span>
            </FadeIn>
            <FadeIn delay={0.1}>
              <h1 className="mt-4 font-heading text-h1 font-light">
                Our Rooms
              </h1>
            </FadeIn>
          </div>

          <div className="mt-16 grid gap-12 md:grid-cols-2 lg:grid-cols-3">
            {rooms.map((room, i) => (
              <FadeIn key={room.slug} delay={i * 0.1}>
                <Link
                  href={`/widget/${hotelSlug}/rooms/${room.slug}`}
                  className="group block"
                >
                  {room.images.hero ? (
                    <div className="relative aspect-[4/3] overflow-hidden">
                      <Image
                        src={room.images.hero}
                        alt={room.name}
                        fill
                        sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        className="object-cover transition-transform duration-700 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-black/0 transition-colors duration-300 group-hover:bg-black/10" />
                    </div>
                  ) : (
                    <div className="aspect-[4/3] bg-cream-dark" />
                  )}

                  <div className="mt-4 text-center">
                    <h2 className="font-heading text-h3 font-light transition-colors duration-300 group-hover:text-green">
                      {room.name}
                    </h2>
                    {room.tagline && (
                      <p className="mt-1 font-body text-small text-gray">
                        {room.tagline}
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap justify-center gap-x-6 gap-y-1">
                      {room.bedType && (
                        <span className="font-body text-xs text-gray">
                          {room.bedType}
                        </span>
                      )}
                      <span className="font-body text-xs text-gray">
                        Up to {room.occupancy} guests
                      </span>
                    </div>
                    {room.pricingTiers.length > 0 && (
                      <p className="mt-3">
                        <span className="font-heading text-h4 font-light text-green">
                          From ${room.pricingTiers[0].price}
                        </span>
                        <span className="ml-1 font-body text-xs text-gray">
                          / night
                        </span>
                      </p>
                    )}
                  </div>
                </Link>
              </FadeIn>
            ))}
          </div>
        </Container>
      </section>
    </main>
  );
}
