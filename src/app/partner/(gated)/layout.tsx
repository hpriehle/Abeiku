import { redirect } from "next/navigation";
import { getPartnerSession } from "@/lib/partner/auth";
import { FONT_BODY, FONT_HEADING } from "@/components/partner/ui";

export default async function PartnerGatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getPartnerSession();
  if (!session) redirect("/partner/login");

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-[#F7F5F0]" style={FONT_BODY}>
      <header className="bg-[#1a1a2e] text-white shrink-0">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 md:px-8 py-3 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-lg font-bold tracking-tight" style={FONT_HEADING}>
              Partner Portal
            </p>
            {session.email && <p className="text-xs text-gray-300 truncate">{session.email}</p>}
          </div>
          {/* Plain form POST: the route clears the cookie and redirects to /partner/login. */}
          <form action="/api/partner/auth/logout" method="POST" className="shrink-0">
            <button
              type="submit"
              className="min-h-11 px-4 text-sm font-medium text-white rounded-lg border border-white/40 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white transition-colors"
            >
              Log out
            </button>
          </form>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
