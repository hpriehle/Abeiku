import { NextResponse } from "next/server";
import { getSession } from "@/lib/admin/auth";
import { getHotelById } from "@/lib/db";

// Simple in-memory cache: { [hotelId]: { data, fetchedAt } }
const cache = new Map<string, { data: unknown; fetchedAt: number }>();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const hotel = await getHotelById(session.hotelId);
  if (!hotel?.google_place_id) {
    return NextResponse.json({ error: "Google Place not connected" }, { status: 404 });
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Google Places API not configured" }, { status: 500 });
  }

  // Check cache
  const cached = cache.get(hotel.id);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return NextResponse.json(cached.data);
  }

  try {
    const res = await fetch(
      `https://places.googleapis.com/v1/places/${hotel.google_place_id}`,
      {
        headers: {
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask":
            "reviews,rating,userRatingCount",
        },
      }
    );

    if (!res.ok) {
      const err = await res.text();
      console.error("Google Places reviews error:", err);
      return NextResponse.json(
        { error: "Failed to fetch Google reviews" },
        { status: 502 }
      );
    }

    const data = await res.json();

    const reviews = (data.reviews || []).map(
      (r: Record<string, unknown>) => ({
        authorName:
          (r.authorAttribution as Record<string, string>)?.displayName || "Anonymous",
        authorPhotoUri:
          (r.authorAttribution as Record<string, string>)?.photoUri || null,
        rating: r.rating,
        text: (r.text as Record<string, string>)?.text || "",
        relativePublishTimeDescription: r.relativePublishTimeDescription,
        publishTime: r.publishTime,
      })
    );

    const responseData = {
      reviews,
      rating: data.rating ?? null,
      totalCount: data.userRatingCount ?? 0,
    };

    // Update cache
    cache.set(hotel.id, { data: responseData, fetchedAt: Date.now() });

    return NextResponse.json(responseData);
  } catch (error) {
    console.error("Google reviews fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch reviews" }, { status: 500 });
  }
}
