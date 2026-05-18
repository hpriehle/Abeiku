import { redirect } from "next/navigation";
import { getSession } from "@/lib/admin/auth";
import { listInfluencersForHotel, getClickCountsByInfluencer } from "@/lib/db/influencers";
import { InfluencersClient } from "./InfluencersClient";

export default async function AdminInfluencersPage() {
  const session = await getSession();
  if (!session) redirect("/admin/login");

  const [influencers, clickCounts] = await Promise.all([
    listInfluencersForHotel(session.hotelId),
    getClickCountsByInfluencer(session.hotelId),
  ]);

  const rows = influencers.map((i) => ({
    id: i.id,
    slug: i.slug,
    name: i.name,
    email: i.email,
    redirect_url: i.redirect_url,
    password_set: Boolean(i.password_hash),
    created_at: i.created_at,
    last_login_at: i.last_login_at,
    total_clicks: clickCounts.get(i.id) ?? 0,
  }));

  return <InfluencersClient initialRows={rows} />;
}
