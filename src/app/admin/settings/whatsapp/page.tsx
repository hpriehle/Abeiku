import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/admin/auth";
import { getHotelById } from "@/lib/db";
import { WhatsAppForm } from "./WhatsAppForm";
import { EmbeddedSignup } from "./EmbeddedSignup";

export default async function WhatsAppSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/admin/login");

  const hotel = await getHotelById(session.hotelId);
  if (!hotel) redirect("/admin/login");

  const connected = !!hotel.whatsapp_access_token;

  return (
    <div className="p-8 max-w-3xl">
      <Link
        href="/admin/settings"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        &larr; Back to Settings
      </Link>

      <div className="flex items-center gap-3 mb-6">
        <span className="text-3xl">💬</span>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">WhatsApp Business</h2>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                connected ? "bg-green-500" : "bg-yellow-400"
              }`}
            />
            <span className={`text-sm ${connected ? "text-green-600" : "text-yellow-600"}`}>
              {connected ? `Connected - Phone ID: ${hotel.whatsapp_phone_number_id}` : "Not configured"}
            </span>
          </div>
        </div>
      </div>

      {connected ? (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center gap-3 bg-green-50 border border-green-100 rounded-lg px-4 py-3 mb-4">
              <span className="inline-block w-3 h-3 rounded-full bg-green-500 shrink-0" />
              <div>
                <p className="text-sm font-medium text-green-800">WhatsApp is connected</p>
                <p className="text-xs text-green-600">
                  Guests can message your hotel and receive automated replies, booking confirmations, and reminders.
                </p>
              </div>
            </div>
          </div>

          <WhatsAppForm connected={connected} />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <p className="text-sm text-gray-600 mb-4">
              Connect WhatsApp to let guests message your hotel directly. Abeiku handles automated replies, booking flow, and guest messaging.
            </p>
            <ul className="text-sm text-gray-500 space-y-1.5">
              <li className="flex items-start gap-2">
                <span className="text-green-500 mt-0.5">&#10003;</span>
                Guests book rooms via WhatsApp chat
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500 mt-0.5">&#10003;</span>
                Automated check-in/checkout reminders
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500 mt-0.5">&#10003;</span>
                Review requests and return offers
              </li>
            </ul>
          </div>

          <EmbeddedSignup />
        </div>
      )}
    </div>
  );
}
