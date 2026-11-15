"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BookingDetailModal } from "./BookingDetailModal";

interface Booking {
  id: string;
  phone: string;
  guest_name: string;
  room_slug: string;
  rooms_count: number;
  check_in: string;
  check_out: string;
  total_price: number;
  currency: string;
  payment_status: string;
  booking_status: string;
  booking_group_id: string | null;
}

interface Room {
  slug: string;
  name: string;
}

interface Props {
  bookings: Booking[];
  rooms: Room[];
  currency: string;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    confirmed: "bg-blue-100 text-blue-700",
    checked_in: "bg-green-100 text-green-700",
    checked_out: "bg-gray-100 text-gray-600",
    cancelled: "bg-red-100 text-red-700",
  };
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[status] ?? "bg-gray-100 text-gray-600"}`}>
      {status.replace("_", " ")}
    </span>
  );
}

function PaymentBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    paid: "bg-green-100 text-green-700",
    unpaid: "bg-yellow-100 text-amber-800",
    pending: "bg-orange-100 text-orange-700",
    refunded: "bg-purple-100 text-purple-700",
  };
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[status] ?? "bg-gray-100 text-gray-600"}`}>
      {status}
    </span>
  );
}

export function BookingsTable({ bookings, rooms, currency }: Props) {
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const router = useRouter();

  return (
    <>
      {/* Phone: one card per booking */}
      <ul className="md:hidden space-y-3">
        {bookings.map((booking) => {
          const room = rooms.find((r) => r.slug === booking.room_slug);
          return (
            <li key={booking.id}>
              <button
                type="button"
                onClick={() => setSelectedBookingId(booking.id)}
                className="w-full text-left bg-white rounded-xl shadow-sm border border-gray-200 p-4 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-[#2D4A3E]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-gray-900 truncate">{booking.guest_name}</div>
                    <div className="text-xs text-gray-600">{booking.phone}</div>
                  </div>
                  <div className="font-medium text-gray-900 whitespace-nowrap">{currency} {booking.total_price}</div>
                </div>
                <div className="mt-2 text-sm text-gray-700">
                  {room?.name ?? booking.room_slug}
                  {booking.booking_group_id && (
                    <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-700">grouped</span>
                  )}
                </div>
                <div className="text-sm text-gray-600">
                  {formatDate(booking.check_in)} — {formatDate(booking.check_out)}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <PaymentBadge status={booking.payment_status} />
                  <StatusBadge status={booking.booking_status} />
                </div>
              </button>
            </li>
          );
        })}
        {bookings.length === 0 && (
          <li className="admin-card py-12 text-center text-gray-600">No bookings found.</li>
        )}
      </ul>

      <div className="hidden md:block bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Guest</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Room</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Dates</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Price</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Payment</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {bookings.map((booking) => {
                const room = rooms.find((r) => r.slug === booking.room_slug);
                const roomLabel = room?.name ?? booking.room_slug;
                const isGrouped = !!booking.booking_group_id;

                return (
                  <tr
                    key={booking.id}
                    onClick={() => setSelectedBookingId(booking.id)}
                    className="hover:bg-gray-50 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setSelectedBookingId(booking.id); }}
                        className="font-medium text-gray-900 text-left hover:underline focus-visible:outline-2 focus-visible:outline-[#2D4A3E] rounded"
                      >
                        {booking.guest_name}
                      </button>
                      <div className="text-xs text-gray-500">{booking.phone}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {roomLabel}
                      {isGrouped && (
                        <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-700">
                          grouped
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {formatDate(booking.check_in)} — {formatDate(booking.check_out)}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">{currency} {booking.total_price}</td>
                    <td className="px-4 py-3"><PaymentBadge status={booking.payment_status} /></td>
                    <td className="px-4 py-3"><StatusBadge status={booking.booking_status} /></td>
                  </tr>
                );
              })}
              {bookings.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-gray-500">
                    No bookings found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedBookingId && (
        <BookingDetailModal
          bookingId={selectedBookingId}
          rooms={rooms}
          currency={currency}
          onClose={() => setSelectedBookingId(null)}
          onUpdated={() => {
            setSelectedBookingId(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
