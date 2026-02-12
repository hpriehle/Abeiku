"use client";

import { useState, useEffect } from "react";

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
  payment_status: "unpaid" | "pending" | "paid" | "refunded";
  booking_status: "confirmed" | "checked_in" | "checked_out" | "cancelled";
  booking_group_id: string | null;
  created_at: string;
}

interface Room {
  slug: string;
  name: string;
}

interface Props {
  bookingId: string;
  rooms: Room[];
  currency: string;
  onClose: () => void;
  onUpdated: () => void;
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    confirmed: "bg-blue-100 text-blue-700",
    checked_in: "bg-green-100 text-green-700",
    checked_out: "bg-gray-100 text-gray-600",
    cancelled: "bg-red-100 text-red-700",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${styles[status] || "bg-gray-100 text-gray-600"}`}>
      {status.replace("_", " ")}
    </span>
  );
}

function PaymentBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    paid: "bg-green-100 text-green-700",
    unpaid: "bg-amber-100 text-amber-700",
    pending: "bg-yellow-100 text-yellow-700",
    refunded: "bg-purple-100 text-purple-700",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${styles[status] || "bg-gray-100 text-gray-600"}`}>
      {status}
    </span>
  );
}

function formatDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function BookingDetailModal({ bookingId, rooms, currency, onClose, onUpdated }: Props) {
  const [booking, setBooking] = useState<Booking | null>(null);
  const [groupedBookings, setGroupedBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState("");
  const [showDateEdit, setShowDateEdit] = useState(false);
  const [newCheckIn, setNewCheckIn] = useState("");
  const [newCheckOut, setNewCheckOut] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/bookings/${bookingId}`)
      .then((r) => r.json())
      .then((data) => {
        setBooking(data.booking);
        setGroupedBookings(data.groupedBookings || []);
        setNewCheckIn(data.booking?.check_in || "");
        setNewCheckOut(data.booking?.check_out || "");
      })
      .finally(() => setLoading(false));
  }, [bookingId]);

  async function doAction(action: string, extra?: Record<string, unknown>) {
    setActionLoading(action);
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      if (res.ok) {
        onUpdated();
        onClose();
      }
    } finally {
      setActionLoading("");
    }
  }

  async function changeDates() {
    if (!newCheckIn || !newCheckOut) return;
    setActionLoading("dates");
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ check_in: newCheckIn, check_out: newCheckOut }),
      });
      if (res.ok) {
        onUpdated();
        onClose();
      }
    } finally {
      setActionLoading("");
    }
  }

  async function changePayment(payment_status: string) {
    setActionLoading(payment_status);
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payment_status }),
      });
      if (res.ok) {
        onUpdated();
        onClose();
      }
    } finally {
      setActionLoading("");
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="bg-white rounded-xl p-8">
          <span className="text-sm text-gray-500">Loading...</span>
        </div>
      </div>
    );
  }

  if (!booking) {
    onClose();
    return null;
  }

  const roomName = rooms.find((r) => r.slug === booking.room_slug)?.name || booking.room_slug;
  const isActive = booking.booking_status === "confirmed" || booking.booking_status === "checked_in";
  const hasGroupSiblings = groupedBookings.length > 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Booking Details</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        <div className="p-6 space-y-5">
          {/* Guest info */}
          <div className="flex items-start justify-between">
            <div>
              <p className="font-semibold text-gray-900 text-lg">{booking.guest_name}</p>
              <p className="text-sm text-gray-500">{booking.phone}</p>
            </div>
            <div className="flex gap-2">
              <StatusBadge status={booking.booking_status} />
              <PaymentBadge status={booking.payment_status} />
            </div>
          </div>

          {/* Booking details grid */}
          <div className="grid grid-cols-2 gap-4 bg-gray-50 rounded-lg p-4">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider">Room</p>
              <p className="text-sm font-medium text-gray-900 mt-0.5">{roomName}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider">Total</p>
              <p className="text-sm font-medium text-gray-900 mt-0.5">{currency} {booking.total_price}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider">Check-in</p>
              <p className="text-sm font-medium text-gray-900 mt-0.5">{formatDate(booking.check_in)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider">Check-out</p>
              <p className="text-sm font-medium text-gray-900 mt-0.5">{formatDate(booking.check_out)}</p>
            </div>
          </div>

          {/* Grouped bookings */}
          {hasGroupSiblings && (
            <div className="border border-purple-200 bg-purple-50 rounded-lg p-4">
              <p className="text-xs font-medium text-purple-700 uppercase tracking-wider mb-2">Linked Bookings</p>
              <div className="space-y-1.5">
                {groupedBookings.map((b) => {
                  const name = rooms.find((r) => r.slug === b.room_slug)?.name || b.room_slug;
                  return (
                    <div key={b.id} className={`text-sm ${b.id === booking.id ? "font-semibold text-purple-900" : "text-purple-700"}`}>
                      {name} — {currency} {b.total_price}
                      {b.id === booking.id && " (this booking)"}
                    </div>
                  );
                })}
                <div className="text-sm font-semibold text-purple-900 pt-1 border-t border-purple-200">
                  Total: {currency} {groupedBookings.reduce((sum, b) => sum + b.total_price, 0)}
                </div>
              </div>
            </div>
          )}

          {/* Date change */}
          {isActive && showDateEdit && (
            <div className="border border-gray-200 rounded-lg p-4 space-y-3">
              <p className="text-sm font-medium text-gray-700">Change Dates</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Check-in</label>
                  <input
                    type="date"
                    value={newCheckIn}
                    onChange={(e) => setNewCheckIn(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#2D4A3E]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Check-out</label>
                  <input
                    type="date"
                    value={newCheckOut}
                    onChange={(e) => setNewCheckOut(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#2D4A3E]"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={changeDates}
                  disabled={!!actionLoading}
                  className="px-4 py-2 bg-[#2D4A3E] text-white text-sm rounded-lg hover:bg-[#1E3329] disabled:opacity-50"
                >
                  {actionLoading === "dates" ? "Saving..." : "Save Dates"}
                </button>
                <button
                  onClick={() => setShowDateEdit(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Cancel confirmation */}
          {isActive && confirmCancel && (
            <div className="border border-red-200 bg-red-50 rounded-lg p-4 space-y-3">
              <p className="text-sm font-medium text-red-700">
                Are you sure you want to cancel this booking?
                {booking.payment_status === "paid" && " Payment will be marked as refunded."}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => doAction("cancelled")}
                  disabled={!!actionLoading}
                  className="px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                  {actionLoading === "cancelled" ? "Cancelling..." : "Cancel Booking"}
                </button>
                {hasGroupSiblings && (
                  <button
                    onClick={() => doAction("cancelled", { cancel_group: true })}
                    disabled={!!actionLoading}
                    className="px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 disabled:opacity-50"
                  >
                    Cancel All Linked
                  </button>
                )}
                <button
                  onClick={() => setConfirmCancel(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50"
                >
                  Keep
                </button>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="space-y-3 pt-2">
            {/* Status actions */}
            {booking.booking_status === "confirmed" && (
              <div className="flex gap-2">
                <button
                  onClick={() => doAction("checked_in")}
                  disabled={!!actionLoading}
                  className="flex-1 py-2.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  {actionLoading === "checked_in" ? "..." : "Check In"}
                </button>
                {!showDateEdit && (
                  <button
                    onClick={() => setShowDateEdit(true)}
                    className="flex-1 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50"
                  >
                    Change Dates
                  </button>
                )}
                {!confirmCancel && (
                  <button
                    onClick={() => setConfirmCancel(true)}
                    className="flex-1 py-2.5 border border-red-300 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50"
                  >
                    Cancel
                  </button>
                )}
              </div>
            )}

            {booking.booking_status === "checked_in" && (
              <div className="flex gap-2">
                <button
                  onClick={() => doAction("checked_out")}
                  disabled={!!actionLoading}
                  className="flex-1 py-2.5 bg-gray-600 text-white text-sm font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50"
                >
                  {actionLoading === "checked_out" ? "..." : "Check Out"}
                </button>
                {!showDateEdit && (
                  <button
                    onClick={() => setShowDateEdit(true)}
                    className="flex-1 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50"
                  >
                    Change Dates
                  </button>
                )}
                {!confirmCancel && (
                  <button
                    onClick={() => setConfirmCancel(true)}
                    className="flex-1 py-2.5 border border-red-300 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50"
                  >
                    Cancel
                  </button>
                )}
              </div>
            )}

            {/* Payment actions */}
            {booking.payment_status === "unpaid" && isActive && (
              <button
                onClick={() => changePayment("paid")}
                disabled={!!actionLoading}
                className="w-full py-2.5 border border-green-300 text-green-700 text-sm font-medium rounded-lg hover:bg-green-50 disabled:opacity-50"
              >
                {actionLoading === "paid" ? "..." : "Mark as Paid"}
              </button>
            )}

            {booking.payment_status === "paid" && booking.booking_status === "cancelled" && (
              <button
                onClick={() => changePayment("refunded")}
                disabled={!!actionLoading}
                className="w-full py-2.5 border border-purple-300 text-purple-700 text-sm font-medium rounded-lg hover:bg-purple-50 disabled:opacity-50"
              >
                {actionLoading === "refunded" ? "..." : "Mark as Refunded"}
              </button>
            )}

            {/* Meta */}
            <p className="text-xs text-gray-400 text-center pt-2">
              Booked {new Date(booking.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              {" "}at {new Date(booking.created_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
