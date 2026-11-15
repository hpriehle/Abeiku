"use client";

import { useState, useEffect } from "react";
import { apiRequest } from "@/lib/admin/api-client";
import { useAdminAction, ErrorNotice } from "../useAdminAction";

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
  const [loadError, setLoadError] = useState<string | null>(null);
  const { pending: actionLoading, error: actionError, setError: setActionError, run } = useAdminAction();
  const [showDateEdit, setShowDateEdit] = useState(false);
  const [newCheckIn, setNewCheckIn] = useState("");
  const [newCheckOut, setNewCheckOut] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiRequest<{ booking: Booking | null; groupedBookings?: Booking[] }>(`/api/admin/bookings/${bookingId}`, {
      fallbackError: "We couldn't load this booking. Please try again.",
    }).then((r) => {
      if (cancelled) return;
      if (r.ok && r.data.booking) {
        setBooking(r.data.booking);
        setGroupedBookings(r.data.groupedBookings || []);
        setNewCheckIn(r.data.booking.check_in || "");
        setNewCheckOut(r.data.booking.check_out || "");
      } else {
        setLoadError(r.ok ? "We couldn't find this booking. It may have been deleted." : r.error);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [bookingId]);

  async function update(key: string, body: Record<string, unknown>, fallbackError: string) {
    const r = await run(key, () =>
      apiRequest(`/api/admin/bookings/${bookingId}`, { method: "PUT", json: body, fallbackError })
    );
    if (r?.ok) {
      onUpdated();
      onClose();
    }
  }

  function doAction(action: string, extra?: Record<string, unknown>, key: string = action) {
    const what =
      action === "cancelled" ? "cancel the booking" : action === "checked_in" ? "check the guest in" : "check the guest out";
    return update(key, { action, ...extra }, `We couldn't ${what}. Nothing was changed. Please try again.`);
  }

  function changeDates() {
    if (!newCheckIn || !newCheckOut) {
      setActionError("Pick both a check-in and a check-out date.");
      return;
    }
    if (newCheckOut <= newCheckIn) {
      setActionError("Check-out must be after check-in.");
      return;
    }
    return update("dates", { check_in: newCheckIn, check_out: newCheckOut }, "We couldn't change the dates. Please try again.");
  }

  function changePayment(payment_status: string) {
    return update(payment_status, { payment_status }, "We couldn't update the payment status. Please try again.");
  }

  if (loading || !booking) {
    return (
      <div role="dialog" aria-modal="true" aria-label="Booking details" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-4">
        <div className="bg-white rounded-xl p-6 sm:p-8 w-full max-w-sm space-y-4">
          {loading ? (
            <span className="text-sm text-gray-600">Loading...</span>
          ) : (
            <>
              <ErrorNotice message={loadError} />
              <button type="button" onClick={onClose} className="admin-btn-secondary w-full">
                Close
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  const roomName = rooms.find((r) => r.slug === booking.room_slug)?.name || booking.room_slug;
  const isActive = booking.booking_status === "confirmed" || booking.booking_status === "checked_in";
  const hasGroupSiblings = groupedBookings.length > 1;

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Booking Details</h3>
          <button onClick={onClose} aria-label="Close" className="text-gray-500 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        <div className="p-4 sm:p-6 space-y-5">
          <ErrorNotice message={actionError} onDismiss={() => setActionError(null)} />
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
                    className="admin-input"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Check-out</label>
                  <input
                    type="date"
                    value={newCheckOut}
                    onChange={(e) => setNewCheckOut(e.target.value)}
                    className="admin-input"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={changeDates}
                  disabled={!!actionLoading}
                  className="admin-btn-primary"
                >
                  {actionLoading === "dates" ? "Saving..." : "Save Dates"}
                </button>
                <button
                  onClick={() => setShowDateEdit(false)}
                  className="admin-btn-secondary"
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
                {booking.payment_status === "paid" && " Payment will be marked as refunded. Abeiku does not send the money back: refund the guest yourself."}
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
                    onClick={() => doAction("cancelled", { cancel_group: true }, "cancelled_group")}
                    disabled={!!actionLoading}
                    className="px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 disabled:opacity-50"
                  >
                    {actionLoading === "cancelled_group" ? "Cancelling..." : "Cancel All Linked"}
                  </button>
                )}
                <button
                  onClick={() => setConfirmCancel(false)}
                  className="admin-btn-secondary"
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
                  className="flex-1 py-2.5 bg-green-700 text-white text-sm font-medium rounded-lg hover:bg-green-800 disabled:opacity-50"
                >
                  {actionLoading === "checked_in" ? "Checking in..." : "Check In"}
                </button>
                {!showDateEdit && (
                  <button
                    onClick={() => setShowDateEdit(true)}
                    className="admin-btn-secondary flex-1"
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
                  {actionLoading === "checked_out" ? "Checking out..." : "Check Out"}
                </button>
                {!showDateEdit && (
                  <button
                    onClick={() => setShowDateEdit(true)}
                    className="admin-btn-secondary flex-1"
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
                {actionLoading === "paid" ? "Saving..." : "Mark as Paid"}
              </button>
            )}

            {booking.payment_status === "paid" && booking.booking_status === "cancelled" && (
              <button
                onClick={() => changePayment("refunded")}
                disabled={!!actionLoading}
                className="w-full py-2.5 border border-purple-300 text-purple-700 text-sm font-medium rounded-lg hover:bg-purple-50 disabled:opacity-50"
              >
                {actionLoading === "refunded" ? "Saving..." : "Mark as Refunded"}
              </button>
            )}

            {/* Meta */}
            <p className="text-xs text-gray-500 text-center pt-2">
              Booked {new Date(booking.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              {" "}at {new Date(booking.created_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
