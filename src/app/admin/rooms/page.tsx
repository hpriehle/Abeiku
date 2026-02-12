import { redirect } from "next/navigation";
import { getSession } from "@/lib/admin/auth";
import { getHotelRooms, getHotelById } from "@/lib/db";
import { RoomTable } from "./RoomTable";

export default async function RoomsPage() {
  const session = await getSession();
  if (!session) redirect("/admin/login");

  const [rooms, hotel] = await Promise.all([
    getHotelRooms(session.hotelId),
    getHotelById(session.hotelId),
  ]);

  return (
    <div className="p-8">
      <RoomTable initialRooms={rooms} currency={hotel?.currency || "GHS"} />
    </div>
  );
}
