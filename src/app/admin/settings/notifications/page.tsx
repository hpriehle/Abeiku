import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/admin/auth";
import { getHotelById, getNotificationPreferences, getNotificationLog } from "@/lib/db";
import { NotificationSettings } from "./NotificationSettings";

export default async function NotificationsPage() {
  const session = await getSession();
  if (!session) redirect("/admin/login");

  const [hotel, preferences, recentLog] = await Promise.all([
    getHotelById(session.hotelId),
    getNotificationPreferences(session.hotelId),
    getNotificationLog(session.hotelId, 20),
  ]);

  if (!hotel) redirect("/admin/login");

  return (
    <div className="p-8 max-w-3xl">
      <Link
        href="/admin/settings"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        &larr; Back to Settings
      </Link>

      <div className="flex items-center gap-3 mb-6">
        <span className="text-3xl">🔔</span>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Notification Settings</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Choose which events notify you and how you want to be notified.
          </p>
        </div>
      </div>

      <NotificationSettings
        hotel={hotel}
        preferences={preferences}
        recentLog={recentLog}
      />
    </div>
  );
}
