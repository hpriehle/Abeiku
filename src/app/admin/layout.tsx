import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/admin/auth";
import { loadBillingView } from "@/lib/billing";
import { loadAdminFeatures, NO_FEATURES } from "@/lib/admin/features";
import { AdminNav } from "./AdminNav";
import { BillingBanner } from "./BillingBanner";

export const metadata: Metadata = {
  title: { template: "%s · Abeiku Admin", default: "Abeiku Admin" },
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  // Billing state from the database (the session claim can be days old, e.g. after a cancel).
  // Never throws: missing columns or exempt hotels give full access.
  const billing = session ? await loadBillingView(session.hotelId) : null;
  if (billing && billing.access !== "full") redirect("/signup");
  // L3: hide features that don't work for this hotel (WhatsApp inbox, Simulator).
  const features = session ? await loadAdminFeatures(session) : NO_FEATURES;

  return (
    <div
      data-admin-shell
      className="fixed inset-0 z-50 flex flex-col md:flex-row bg-gray-50"
      style={{ fontFamily: "var(--font-body), system-ui, sans-serif" }}
    >
      <AdminNav
        hotelName={session?.hotelName || "Hotel Admin"}
        email={session?.email || "Hotel Admin"}
        platformAdmin={session?.role === "platform_admin"}
        showPlan={!!billing && !billing.legacy && !billing.exempt}
        showCommunication={features.communication}
        showSimulator={features.simulator}
      />

      <main className="flex-1 min-w-0 overflow-y-auto">
        {billing?.banner && <BillingBanner banner={billing.banner} />}
        {children}
      </main>
    </div>
  );
}
