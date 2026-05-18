import { redirect } from "next/navigation";
import { getPartnerSession } from "@/lib/partner/auth";

export default async function PartnerGatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getPartnerSession();
  if (!session) redirect("/partner/login");

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col bg-[#F7F5F0]"
      style={{ fontFamily: "var(--font-body), system-ui, sans-serif" }}
    >
      <header className="bg-[#1a1a2e] text-white px-6 py-4 flex items-center justify-between shrink-0">
        <div>
          <h1
            className="text-lg font-bold tracking-tight"
            style={{ fontFamily: "var(--font-heading), Georgia, serif" }}
          >
            Partner Portal
          </h1>
          <p className="text-xs text-gray-400">{session.email}</p>
        </div>
        <form action="/api/partner/auth/logout" method="POST">
          <button
            type="submit"
            className="text-sm text-gray-300 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-white/10"
          >
            Log out
          </button>
        </form>
      </header>

      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
