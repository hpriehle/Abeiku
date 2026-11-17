import type { Metadata } from "next";
import { FORGOT } from "@/lib/partner/p2-copy";

export const metadata: Metadata = { title: FORGOT.title };

export default function PartnerForgotLayout({ children }: { children: React.ReactNode }) {
  return children;
}
