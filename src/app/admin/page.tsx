import { redirect } from "next/navigation";
import { getSession } from "@/lib/admin/auth";
import { getHotelRooms } from "@/lib/db";

export default async function AdminPage() {
  const session = await getSession();
  if (!session) redirect("/admin/login");

  const rooms = await getHotelRooms(session.hotelId);
  if (rooms.length === 0) {
    redirect("/admin/onboarding");
  }

  redirect("/admin/dashboard");
}
