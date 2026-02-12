import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin/auth";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = request.nextUrl.searchParams.get("q");
  if (!q || q.length < 2) {
    return NextResponse.json({ error: "Query too short" }, { status: 400 });
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Google Places API not configured" }, { status: 500 });
  }

  try {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.googleMapsUri",
      },
      body: JSON.stringify({
        textQuery: q,
        includedType: "lodging",
        maxResultCount: 5,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Google Places API error:", err);
      return NextResponse.json({ error: "Failed to search Google Places" }, { status: 502 });
    }

    const data = await res.json();
    const places = (data.places || []).map((p: Record<string, unknown>) => ({
      id: p.id,
      displayName: (p.displayName as Record<string, string>)?.text || "",
      formattedAddress: p.formattedAddress,
      rating: p.rating,
      userRatingCount: p.userRatingCount,
      googleMapsUri: p.googleMapsUri,
    }));

    return NextResponse.json({ places });
  } catch (error) {
    console.error("Google Places search error:", error);
    return NextResponse.json({ error: "Failed to search" }, { status: 500 });
  }
}
