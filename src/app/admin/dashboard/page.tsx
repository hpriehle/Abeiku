import {
  getBookingStats,
  getBookingsForMonth,
  getReviewStats,
  getConversationCount,
  getReferralStats,
  getHotelById,
} from "@/lib/db";
import { getSession } from "@/lib/admin/auth";
import { redirect } from "next/navigation";
import { BookingCalendar } from "./BookingCalendar";
import { getBookedDates } from "@/lib/calendar";
import { hotelStorage } from "@/lib/hotel-context";

function StatCard({ label, value, sub, icon }: { label: string; value: string | number; sub?: string; icon: string }) {
  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-2xl font-bold mt-1 text-gray-900">{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
        </div>
        <span className="text-2xl">{icon}</span>
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

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const firstDay = `${currentYear}-${String(currentMonth).padStart(2, "0")}-01`;
  const lastDayDate = new Date(currentYear, currentMonth, 0);
  const lastDay = `${currentYear}-${String(currentMonth).padStart(2, "0")}-${String(lastDayDate.getDate()).padStart(2, "0")}`;

  const [bookings, calendarBookings, calendarDates, reviews, conversations, referrals] = await Promise.all([
    getBookingStats(hotelId),
    getBookingsForMonth(hotelId, currentYear, currentMonth),
    hotel
      ? hotelStorage.run({ hotelId: hotel.id, hotel }, () => getBookedDates(firstDay, lastDay)).catch(() => [] as string[])
      : ([] as string[]),
    getReviewStats(hotelId),
    getConversationCount(hotelId),
    getReferralStats(hotelId),
  ]);

  // Deduplicate: dates covered by DB bookings are not "external blocks"
  const dbBookedDates = new Set<string>();
  for (const b of calendarBookings) {
    const start = new Date(b.check_in + "T00:00:00");
    const end = new Date(b.check_out + "T00:00:00");
    const cursor = new Date(start);
    while (cursor <= end) {
      const y = cursor.getFullYear();
      const m = String(cursor.getMonth() + 1).padStart(2, "0");
      const d = String(cursor.getDate()).padStart(2, "0");
      dbBookedDates.add(`${y}-${m}-${d}`);
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  const blockedDates = calendarDates.filter((d) => !dbBookedDates.has(d));

  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          icon="📅"
          label="Total Bookings"
          value={bookings.total}
          sub={`${bookings.confirmed} upcoming · ${bookings.checked_in} in-house`}
        />
        <StatCard
          icon="💰"
          label="Revenue (Paid)"
          value={`${currency} ${bookings.paidRevenue.toLocaleString()}`}
          sub={`${currency} ${bookings.totalRevenue.toLocaleString()} total`}
        />
        <StatCard
          icon="⭐"
          label="Avg Rating"
          value={reviews.totalReviews > 0 ? reviews.averageRating.toFixed(1) : "—"}
          sub={`${reviews.totalReviews} reviews`}
        />
        <StatCard
          icon="💬"
          label="Conversations"
          value={conversations}
          sub={`${referrals.totalCodes} referral codes · ${referrals.totalUses} uses`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Booking Status Breakdown */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Booking Status</h3>
          <div className="space-y-3">
            <StatusBar label="Confirmed" count={bookings.confirmed} total={bookings.total} color="bg-blue-500" />
            <StatusBar label="Checked In" count={bookings.checked_in} total={bookings.total} color="bg-green-500" />
            <StatusBar label="Checked Out" count={bookings.checked_out} total={bookings.total} color="bg-gray-400" />
            <StatusBar label="Cancelled" count={bookings.cancelled} total={bookings.total} color="bg-red-400" />
          </div>
        </div>

        {/* Rating Distribution */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
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
            <p className="text-gray-400 text-sm">No reviews yet.</p>
          )}
        </div>
      </div>

      {/* Calendar */}
      <div className="mt-6">
        <BookingCalendar
          initialBookings={calendarBookings.map((b) => ({
            id: b.id,
            guest_name: b.guest_name,
            room_slug: b.room_slug,
            check_in: b.check_in,
            check_out: b.check_out,
            booking_status: b.booking_status,
            rooms_count: b.rooms_count,
          }))}
          initialBlockedDates={blockedDates}
          initialYear={currentYear}
          initialMonth={currentMonth}
        />
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
