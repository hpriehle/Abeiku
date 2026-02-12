import { notFound } from "next/navigation";
import { getHotelBySlug, getHotelRooms } from "@/lib/db";
import { mapHotelRoomToWidgetRoom, mapHotelToWidgetHotel } from "../../types";
import { EmbedClient } from "./EmbedClient";

interface EmbedPageProps {
  params: Promise<{ hotelSlug: string }>;
}

export default async function EmbedPage({ params }: EmbedPageProps) {
  const { hotelSlug } = await params;

  const hotel = await getHotelBySlug(hotelSlug);
  if (!hotel) notFound();

  const rawRooms = await getHotelRooms(hotel.id);
  const rooms = rawRooms.map(mapHotelRoomToWidgetRoom);
  const widgetHotel = mapHotelToWidgetHotel(hotel);

  return <EmbedClient rooms={rooms} hotel={widgetHotel} />;
}
