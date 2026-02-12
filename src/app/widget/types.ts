import { HotelRoom, Hotel } from "@/lib/db";

export interface WidgetPricingTier {
  rooms: number;
  price: number;
  label: string;
}

export interface WidgetRoom {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  pricingTiers: WidgetPricingTier[];
  totalRooms: number;
  size: string;
  bedType: string;
  occupancy: number;
  amenities: string[];
  airbnbUrl: string | null;
  images: { hero: string; gallery: string[] };
  roomType: "standard" | "group" | "individual";
}

export interface WidgetHotel {
  name: string;
  slug: string;
  whatsappPhone: string | null;
  currency: string;
}

export function mapHotelRoomToWidgetRoom(room: HotelRoom): WidgetRoom {
  return {
    slug: room.slug,
    name: room.name,
    tagline: room.tagline ?? "",
    description: room.description ?? "",
    pricingTiers: room.pricing_tiers,
    totalRooms: room.total_rooms,
    size: room.size ?? "",
    bedType: room.bed_type ?? "",
    occupancy: room.occupancy,
    amenities: room.amenities,
    airbnbUrl: room.airbnb_url,
    images: {
      hero: room.images.hero ?? "",
      gallery: room.images.gallery ?? [],
    },
    roomType: room.room_type,
  };
}

export function mapHotelToWidgetHotel(hotel: Hotel): WidgetHotel {
  return {
    name: hotel.name,
    slug: hotel.slug,
    whatsappPhone: hotel.whatsapp_display_phone,
    currency: hotel.currency,
  };
}
