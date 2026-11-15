import { redirect } from "next/navigation";
import { getSession } from "@/lib/admin/auth";
import { CalendarBoard } from "./CalendarBoard";

export const metadata = { title: "Calendar" };

export default async function CalendarPage() {
  const session = await getSession();
  if (!session) redirect("/admin/login");

  return (
    <div className="admin-page">
      <h1 className="admin-h1">Calendar</h1>
      <p className="admin-subtitle mb-6">Every booking, from the website, MoMo, the Google calendar, Airbnb, VRBO, Booking.com and WhatsApp.</p>
      <CalendarBoard />
    </div>
  );
}
