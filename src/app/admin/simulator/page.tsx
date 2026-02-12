import { getSession } from "@/lib/admin/auth";
import { getHotelById } from "@/lib/db";
import { redirect } from "next/navigation";
import { SimulatorChat } from "./SimulatorChat";

export default async function SimulatorPage() {
  const session = await getSession();
  if (!session) redirect("/admin/login");

  const hotel = await getHotelById(session.hotelId);
  if (!hotel) redirect("/admin/login");

  return (
    <div className="h-full flex flex-col">
      <div className="p-6 pb-0">
        <h1
          className="text-2xl font-bold text-gray-900"
          style={{ fontFamily: "var(--font-heading), Georgia, serif" }}
        >
          WhatsApp Simulator
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Test the booking flow without Meta API credentials
        </p>
      </div>
      <div className="flex-1 min-h-0 p-6">
        <SimulatorChat hotelName={hotel.name} />
      </div>
    </div>
  );
}
