import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/admin/auth";
import { getHotelById } from "@/lib/db";
import { GoogleReviewsForm } from "./GoogleReviewsForm";

export default async function GoogleReviewsSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/admin/login");

  const hotel = await getHotelById(session.hotelId);
  if (!hotel) redirect("/admin/login");

  const connected = !!hotel.google_place_id;

  return (
    <div className="admin-page-narrow">
      <Link
        href="/admin/settings"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        &larr; Back to Settings
      </Link>

      <div className="flex items-center gap-3 mb-6">
        <span className="text-3xl">⭐</span>
        <div>
          <h1 className="admin-h1">Google Reviews</h1>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                connected ? "bg-green-500" : "bg-yellow-400"
              }`}
            />
            <span className={`text-sm ${connected ? "text-green-700" : "text-amber-700"}`}>
              {connected ? "Connected" : "Not configured"}
            </span>
          </div>
        </div>
      </div>

      <GoogleReviewsForm
        currentPlaceId={hotel.google_place_id}
        hotelName={hotel.name}
        hotelCity={hotel.location_city}
      />
    </div>
  );
}
