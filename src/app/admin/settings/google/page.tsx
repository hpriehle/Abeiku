import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/admin/auth";
import { getHotelById, getOAuthToken } from "@/lib/db";
import { CalendarPicker } from "./CalendarPicker";

export default async function GoogleSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/admin/login");

  const [hotel, oauthToken] = await Promise.all([
    getHotelById(session.hotelId),
    getOAuthToken(session.hotelId, "google"),
  ]);

  if (!hotel) redirect("/admin/login");

  const connected = !!oauthToken;

  return (
    <div className="p-8 max-w-3xl">
      <Link
        href="/admin/settings"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        &larr; Back to Settings
      </Link>

      <div className="flex items-center gap-3 mb-6">
        <span className="text-3xl">📅</span>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Google Calendar</h2>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                connected ? "bg-green-500" : "bg-yellow-400"
              }`}
            />
            <span className={`text-sm ${connected ? "text-green-600" : "text-yellow-600"}`}>
              {connected ? "Connected" : "Not connected"}
            </span>
          </div>
        </div>
      </div>

      {connected ? (
        <div className="space-y-6">
          {/* Connected status */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center gap-3 bg-green-50 border border-green-100 rounded-lg px-4 py-3 mb-4">
              <span className="inline-block w-3 h-3 rounded-full bg-green-500 shrink-0" />
              <div>
                <p className="text-sm font-medium text-green-800">Google Calendar is connected</p>
                <p className="text-xs text-green-600">
                  Bookings sync automatically. Events are created when guests book, updated when dates change, and removed when cancelled.
                </p>
              </div>
            </div>
            <a
              href="/api/auth/google"
              className="inline-block px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Re-authorize
            </a>
          </div>

          {/* Calendar picker */}
          <CalendarPicker currentCalendarId={oauthToken?.calendar_id || null} />
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <p className="text-sm text-gray-600 mb-4">
            Connect your Google account to sync bookings with Google Calendar.
            You&apos;ll see booking events on your phone automatically.
          </p>
          <ul className="text-sm text-gray-500 space-y-1.5 mb-5">
            <li className="flex items-start gap-2">
              <span className="text-green-500 mt-0.5">&#10003;</span>
              Calendar events created when guests book
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-500 mt-0.5">&#10003;</span>
              Events updated when booking dates change
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-500 mt-0.5">&#10003;</span>
              Events removed when bookings are cancelled
            </li>
          </ul>
          <a
            href="/api/auth/google"
            className="inline-block px-5 py-2.5 bg-[#2D4A3E] text-white rounded-lg text-sm font-medium hover:bg-[#1E3329] transition-colors"
          >
            Connect Google Calendar
          </a>
        </div>
      )}
    </div>
  );
}
