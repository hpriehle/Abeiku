import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getPartnerSession } from "@/lib/partner/auth";

export const metadata: Metadata = { title: "Sign in" };

// Already signed in: skip the form.
export default async function PartnerLoginLayout({ children }: { children: React.ReactNode }) {
  if (await getPartnerSession()) redirect("/partner/dashboard");
  return children;
}
