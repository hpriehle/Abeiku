import { Bell } from "lucide-react";
import { redirect } from "next/navigation";
import { hotelView } from "@/lib/admin/hotel-view";
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
    <div className="admin-page-narrow">
      <Link
        href="/admin/settings"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        &larr; Back to Settings
      </Link>

      <div className="flex items-center gap-3 mb-6">
        <Bell className="size-8 text-[#2D4A3E] shrink-0" aria-hidden="true" />
        <div>
          <h1 className="admin-h1">Notification Settings</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Choose which events notify you and how you want to be notified.
          </p>
        </div>
      </div>

      <NotificationSettings
        hotel={hotelView(hotel)}
        preferences={preferences}
        recentLog={recentLog}
      />
    </div>
  );
}
