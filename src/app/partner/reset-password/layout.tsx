import type { Metadata } from "next";
import { RESET } from "@/lib/partner/p2-copy";

export const metadata: Metadata = { title: RESET.title };

export default function PartnerResetLayout({ children }: { children: React.ReactNode }) {
  return children;
}
