import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/admin/auth";
import { CalendarFeeds } from "./CalendarFeeds";

export const metadata: Metadata = { title: "Calendars" };

export default async function CalendarsSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/admin/login");

  return (
    <div className="admin-page-narrow">
      <Link href="/admin/settings" className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-800 mb-4">
        &larr; Back to Settings
      </Link>
      <h1 className="admin-h1">Calendars</h1>
      <p className="admin-subtitle">
        Bookings from these calendars show on your Calendar page. We check them every 15 minutes.
      </p>
      <CalendarFeeds />
    </div>
  );
}
