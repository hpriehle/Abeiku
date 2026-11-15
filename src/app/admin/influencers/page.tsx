import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/admin/auth";
import { listInfluencersForHotel, listBookingsForHotel } from "@/lib/db/influencers";
import { adminSiteUrl, buildAdminView } from "@/lib/partner/views";
import { InfluencersClient } from "./InfluencersClient";

export const metadata: Metadata = { title: "Partners" };

export default async function AdminPartnersPage() {
  const session = await getSession();
  if (!session) redirect("/admin/login");

  const [partners, bookings] = await Promise.all([
    listInfluencersForHotel(session.hotelId),
    listBookingsForHotel(session.hotelId),
  ]);

  return <InfluencersClient initial={buildAdminView(partners, bookings, await adminSiteUrl(session.hotelId))} />;
}
