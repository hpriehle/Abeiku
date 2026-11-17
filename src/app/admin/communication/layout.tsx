import { redirect } from "next/navigation";
import { currentAdminFeatures } from "@/lib/admin/features";
import { CommunicationTabs } from "./CommunicationTabs";

// L3: the WhatsApp inbox only for hotels with WhatsApp connected (or exempt); others go to the dashboard.
export default async function CommunicationLayout({ children }: { children: React.ReactNode }) {
  const features = await currentAdminFeatures();
  if (!features) redirect("/admin/login");
  if (!features.communication) redirect("/admin/dashboard");
  return <CommunicationTabs>{children}</CommunicationTabs>;
}
