import Link from "next/link";
import { getAllBookings, getTotalBookingCount, getHotelRooms, getHotelById } from "@/lib/db";
import { getSession } from "@/lib/admin/auth";
import { redirect } from "next/navigation";
import { BookingsTable } from "./BookingsTable";

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/admin/login");

  const { hotelId } = session;
  const hotel = await getHotelById(hotelId);
  const currency = hotel?.currency || "GHS";
  const rooms = await getHotelRooms(hotelId);

  const params = await searchParams;
  const status = params.status;
  const page = parseInt(params.page ?? "1");
  const limit = 20;
  const offset = (page - 1) * limit;

  const bookings = await getAllBookings(hotelId, { status, limit, offset });
  const total = await getTotalBookingCount(hotelId, status);
  const totalPages = Math.ceil(total / limit);

  // Slim room data for client component
  const roomMap = rooms.map((r) => ({ slug: r.slug, name: r.name }));

  return (
    <div className="admin-page">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-6">
        <h1 className="admin-h1">Bookings</h1>
        <p className="text-sm text-gray-500">{total} total</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-6">
        {[
          { label: "All", value: undefined },
          { label: "Confirmed", value: "confirmed" },
          { label: "Checked In", value: "checked_in" },
          { label: "Checked Out", value: "checked_out" },
          { label: "Cancelled", value: "cancelled" },
        ].map((filter) => (
          <Link
            key={filter.label}
            href={`/admin/bookings${filter.value ? `?status=${filter.value}` : ""}`}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              status === filter.value || (!status && !filter.value)
                ? "bg-[#2D4A3E] text-white"
                : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
            }`}
          >
            {filter.label}
          </Link>
        ))}
      </div>

      <BookingsTable bookings={bookings} rooms={roomMap} currency={currency} />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-wrap justify-center gap-2 mt-6">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={`/admin/bookings?${status ? `status=${status}&` : ""}page=${p}`}
              className={`px-3 py-1.5 rounded-lg text-sm ${
                p === page
                  ? "bg-[#2D4A3E] text-white"
                  : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
              }`}
            >
              {p}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
