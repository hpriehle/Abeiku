import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/admin/auth";
import { getHotelById } from "@/lib/db";
import { WhatsAppTemplates } from "./WhatsAppTemplates";

export default async function WhatsAppTemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ to?: string; name?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/admin/login");
  const hotel = await getHotelById(session.hotelId);
  if (!hotel) redirect("/admin/login");

  const connected = !!hotel.whatsapp_access_token && !!hotel.whatsapp_waba_id;
  const { to, name } = await searchParams;

  if (!connected) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-1">WhatsApp isn&apos;t connected</h3>
        <p className="text-sm text-gray-500">
          Connect your WhatsApp Business number in{" "}
          <Link href="/admin/settings/whatsapp" className="text-[#2D4A3E] hover:underline font-medium">
            Settings → WhatsApp
          </Link>{" "}
          to create and send message templates.
        </p>
      </div>
    );
  }

  return (
    <WhatsAppTemplates
      displayPhone={hotel.whatsapp_display_phone}
      hotelName={hotel.name}
      initialTo={to ?? ""}
      initialGuestName={name ?? ""}
    />
  );
}
