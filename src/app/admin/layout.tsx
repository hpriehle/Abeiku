import type { Metadata } from "next";
import { getSession } from "@/lib/admin/auth";
import { AdminNav } from "./AdminNav";

export const metadata: Metadata = {
  title: { template: "%s · Abeiku Admin", default: "Abeiku Admin" },
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col md:flex-row bg-gray-50"
      style={{ fontFamily: "var(--font-body), system-ui, sans-serif" }}
    >
      <AdminNav
        hotelName={session?.hotelName || "Hotel Admin"}
        email={session?.email || "Hotel Admin"}
        platformAdmin={session?.role === "platform_admin"}
      />

      <main className="flex-1 min-w-0 overflow-y-auto">{children}</main>
    </div>
  );
}
