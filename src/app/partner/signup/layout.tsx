import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getPartnerSession } from "@/lib/partner/auth";
import { SIGNUP } from "@/lib/partner/p2-copy";

export const metadata: Metadata = { title: SIGNUP.title };

// Already signed in: go to the dashboard.
export default async function PartnerSignupLayout({ children }: { children: React.ReactNode }) {
  if (await getPartnerSession()) redirect("/partner/dashboard");
  return children;
}
