import { getSession } from "@/lib/admin/auth";
import { getHotelById } from "@/lib/db";
import { redirect } from "next/navigation";
import { SimulatorChat } from "./SimulatorChat";
import { isBookingBotEnabled } from "@/lib/whatsapp/inbound";

export default async function SimulatorPage() {
  const session = await getSession();
  if (!session) redirect("/admin/login");

  const hotel = await getHotelById(session.hotelId);
  if (!hotel) redirect("/admin/login");

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 sm:p-6 pb-0 sm:pb-0">
        <h1 className="admin-h1">
          WhatsApp Simulator
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Test the booking flow without Meta API credentials
        </p>
      </div>
      {isBookingBotEnabled(hotel) ? (
        <div className="flex-1 min-h-0 p-4 sm:p-6">
          <SimulatorChat hotelName={hotel.name} />
        </div>
      ) : (
        <div className="p-4 sm:p-6">
          <div role="status" className="admin-card max-w-xl text-sm text-gray-700 space-y-2">
            <p className="font-medium text-gray-900">The WhatsApp booking bot is off for this hotel.</p>
            <p>
              Guest messages go to your Inbox and a person replies. Abeiku does not answer automatically, take
              bookings or send booking confirmations, so there is nothing to simulate.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
