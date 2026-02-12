import { notFound } from "next/navigation";
import Link from "next/link";
import { getHotelBySlug, getHotelRoomBySlug } from "@/lib/db";
import { mapHotelRoomToWidgetRoom, mapHotelToWidgetHotel } from "../../../types";
import { RoomHero } from "../../../components/RoomHero";
import { RoomDetails } from "../../../components/RoomDetails";
import { RoomGallery } from "../../../components/RoomGallery";
import { RoomAmenities } from "../../../components/RoomAmenities";
import { CurrencyToggle } from "../../../components/CurrencyToggle";

interface RoomDetailPageProps {
  params: Promise<{ hotelSlug: string; roomSlug: string }>;
}

export default async function RoomDetailPage({ params }: RoomDetailPageProps) {
  const { hotelSlug, roomSlug } = await params;

  const hotel = await getHotelBySlug(hotelSlug);
  if (!hotel) notFound();

  const rawRoom = await getHotelRoomBySlug(hotel.id, roomSlug);
  if (!rawRoom) notFound();

  const room = mapHotelRoomToWidgetRoom(rawRoom);
  const widgetHotel = mapHotelToWidgetHotel(hotel);

  return (
    <main>
      <div className="fixed top-4 right-4 z-50 flex items-center gap-3">
        <CurrencyToggle />
      </div>

      <RoomHero room={room} />
      <RoomDetails room={room} hotel={widgetHotel} />
      <RoomGallery room={room} />
      <RoomAmenities room={room} />

      <div className="pb-16 text-center">
        <Link
          href={`/widget/${hotelSlug}`}
          className="inline-flex items-center gap-2 font-body text-small text-green transition-colors hover:text-green-light"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back to all rooms
        </Link>
      </div>
    </main>
  );
}
