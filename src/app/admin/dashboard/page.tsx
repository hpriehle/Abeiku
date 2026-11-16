import { CalendarDays, type LucideIcon, MessageSquare, Star, Wallet } from "lucide-react";
import { getBookingStats, getReviewStats, getConversationCount, getReferralStats, getHotelById } from "@/lib/db";
import { getSession } from "@/lib/admin/auth";
import { redirect } from "next/navigation";
import { CalendarBoard } from "../calendar/CalendarBoard";

function StatCard({ label, value, sub, icon: Icon }: { label: string; value: string | number; sub?: string; icon: LucideIcon }) {
  return (
    <div className="admin-card">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-2xl font-bold mt-1 text-gray-900">{value}</p>
          {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
        </div>
        <Icon className="size-6 text-[#2D4A3E] shrink-0" aria-hidden="true" />
      </div>
    </div>
  );
}

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/admin/login");

  const { hotelId } = session;
  const hotel = await getHotelById(hotelId);
  const currency = hotel?.currency || "GHS";

  const [bookings, reviews, conversations, referrals] = await Promise.all([
    getBookingStats(hotelId),
    getReviewStats(hotelId),
    getConversationCount(hotelId),
    getReferralStats(hotelId),
  ]);

  return (
    <div className="admin-page">
      <h1 className="admin-h1 mb-6">Dashboard</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          icon={CalendarDays}
          label="Total Bookings"
          value={bookings.total}
          sub={`${bookings.confirmed} upcoming · ${bookings.checked_in} in-house`}
        />
        <StatCard
          icon={Wallet}
          label="Revenue (Paid)"
          value={`${currency} ${bookings.paidRevenue.toLocaleString()}`}
          sub={`${currency} ${bookings.totalRevenue.toLocaleString()} total`}
        />
        <StatCard
          icon={Star}
          label="Avg Rating"
          value={reviews.totalReviews > 0 ? reviews.averageRating.toFixed(1) : "—"}
          sub={`${reviews.totalReviews} reviews`}
        />
        <StatCard
          icon={MessageSquare}
          label="Conversations"
          value={conversations}
          sub={`${referrals.totalCodes} referral codes · ${referrals.totalUses} uses`}
        />
      </div>

      {/* C1: every booking from every source, the main block of the dashboard. */}
      <div className="mb-8">
        <CalendarBoard onDashboard />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Booking Status Breakdown */}
        <div className="admin-card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Booking Status</h3>
          <div className="space-y-3">
            <StatusBar label="Confirmed" count={bookings.confirmed} total={bookings.total} color="bg-blue-500" />
            <StatusBar label="Checked In" count={bookings.checked_in} total={bookings.total} color="bg-green-500" />
            <StatusBar label="Checked Out" count={bookings.checked_out} total={bookings.total} color="bg-gray-400" />
            <StatusBar label="Cancelled" count={bookings.cancelled} total={bookings.total} color="bg-red-400" />
          </div>
        </div>

        {/* Rating Distribution */}
        <div className="admin-card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Rating Distribution</h3>
          {reviews.totalReviews > 0 ? (
            <div className="space-y-3">
              <RatingBar stars={5} count={reviews.fiveStars} total={reviews.totalReviews} />
              <RatingBar stars={4} count={reviews.fourStars} total={reviews.totalReviews} />
              <RatingBar stars={3} count={reviews.threeStars} total={reviews.totalReviews} />
              <RatingBar stars={2} count={reviews.twoStars} total={reviews.totalReviews} />
              <RatingBar stars={1} count={reviews.oneStar} total={reviews.totalReviews} />
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No reviews yet.</p>
          )}
        </div>
      </div>

    </div>
  );
}

function StatusBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-gray-600 w-24">{label}</span>
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm font-medium text-gray-700 w-8 text-right">{count}</span>
    </div>
  );
}

function RatingBar({ stars, count, total }: { stars: number; count: number; total: number }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-gray-600 w-12">{stars} star</span>
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full bg-yellow-400" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm font-medium text-gray-700 w-8 text-right">{count}</span>
    </div>
  );
}
