import { Container } from "./Container";
import { FadeIn } from "./FadeIn";
import { BookingWidget } from "./BookingWidget";
import type { WidgetRoom, WidgetHotel } from "../types";

interface RoomDetailsProps {
  room: WidgetRoom;
  hotel: WidgetHotel;
}

export function RoomDetails({ room, hotel }: RoomDetailsProps) {
  return (
    <section className="py-24 md:py-32">
      <Container>
        <div className="mx-auto max-w-3xl text-center">
          {room.description && (
            <FadeIn>
              <p className="font-body text-body-lg font-light leading-relaxed text-gray">
                {room.description}
              </p>
            </FadeIn>
          )}

          <FadeIn delay={0.2}>
            <div className="mt-10 grid grid-cols-1 gap-8 border-y border-gray-light py-8 sm:grid-cols-3">
              {room.size && (
                <div>
                  <span className="font-body text-xs uppercase tracking-widest text-green">
                    Size
                  </span>
                  <p className="mt-2 font-heading text-h3 font-light">
                    {room.size}
                  </p>
                </div>
              )}
              <div>
                <span className="font-body text-xs uppercase tracking-widest text-green">
                  Rooms
                </span>
                <p className="mt-2 font-heading text-h3 font-light">
                  {room.totalRooms}
                </p>
              </div>
              <div>
                <span className="font-body text-xs uppercase tracking-widest text-green">
                  Guests
                </span>
                <p className="mt-2 font-heading text-h3 font-light">
                  Up to {room.occupancy * room.totalRooms}
                </p>
              </div>
            </div>
          </FadeIn>

          <FadeIn delay={0.3}>
            <div className="mt-10 flex justify-center">
              <BookingWidget room={room} hotel={hotel} />
            </div>
          </FadeIn>
        </div>
      </Container>
    </section>
  );
}
