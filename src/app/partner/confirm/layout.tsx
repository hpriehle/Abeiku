import type { Metadata } from "next";
import { CONFIRM } from "@/lib/partner/p2-copy";

export const metadata: Metadata = { title: CONFIRM.title };

export default function PartnerConfirmLayout({ children }: { children: React.ReactNode }) {
  return children;
}
