import { getAllReviews, getReviewStats, getHotelById } from "@/lib/db";
import { getSession } from "@/lib/admin/auth";
import { redirect } from "next/navigation";
import { ReviewsList } from "./ReviewsList";

export default async function ReviewsPage() {
  const session = await getSession();
  if (!session) redirect("/admin/login");

  const { hotelId } = session;

  const [reviews, stats, hotel] = await Promise.all([
    getAllReviews(hotelId),
    getReviewStats(hotelId),
    getHotelById(hotelId),
  ]);

  const hasGooglePlace = !!hotel?.google_place_id;

  // Serialize internal reviews for the client component
  const internalReviews = reviews.map((r) => ({
    id: r.id,
    rating: r.rating,
    feedback: r.feedback,
    created_at: r.created_at,
    guest_name: r.guest_name,
    room_slug: r.room_slug,
    check_in: r.check_in,
    check_out: r.check_out,
  }));

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h2
          className="text-2xl font-bold text-gray-900"
          style={{ fontFamily: "var(--font-heading), Georgia, serif" }}
        >
          Reviews
        </h2>
        {stats.totalReviews > 0 && (
          <div className="text-right">
            <p className="text-xs text-gray-500">
              {stats.totalReviews} internal · avg {stats.averageRating.toFixed(1)} ★
            </p>
          </div>
        )}
      </div>

      <ReviewsList
        internalReviews={internalReviews}
        hasGooglePlace={hasGooglePlace}
      />
    </div>
  );
}
