import { redirect } from "next/navigation";
import { getPartnerSession } from "@/lib/partner/auth";

// /partner has no page of its own: go to the dashboard, or to login when signed out.
export default async function PartnerIndex() {
  redirect((await getPartnerSession()) ? "/partner/dashboard" : "/partner/login");
}
