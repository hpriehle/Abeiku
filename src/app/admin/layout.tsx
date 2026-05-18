import Link from "next/link";
import { getSession } from "@/lib/admin/auth";

function NavLink({ href, label, icon }: { href: string; label: string; icon: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
    >
      <span className="text-lg">{icon}</span>
      {label}
    </Link>
  );
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const hotelName = session?.hotelName || "Hotel Admin";

  return (
    <div className="fixed inset-0 z-50 flex bg-gray-50" style={{ fontFamily: "var(--font-body), system-ui, sans-serif" }}>
      <aside className="w-64 bg-[#1a1a2e] text-white flex flex-col shrink-0">
        <div className="p-6 border-b border-white/10">
          <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: "var(--font-heading), Georgia, serif" }}>
            {hotelName}
          </h1>
          <p className="text-xs text-gray-400 mt-1">{session?.email || "Hotel Admin"}</p>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          <NavLink href="/admin/dashboard" label="Dashboard" icon="📊" />
          <NavLink href="/admin/communication" label="Communication" icon="💬" />
          <NavLink href="/admin/bookings" label="Bookings" icon="📅" />
          <NavLink href="/admin/payments" label="Payments" icon="💰" />
          <NavLink href="/admin/rooms" label="Rooms" icon="🛏️" />
          <NavLink href="/admin/influencers" label="Influencers" icon="🔗" />
          <NavLink href="/admin/reviews" label="Reviews" icon="⭐" />
          <NavLink href="/admin/settings" label="Settings" icon="⚙️" />
          <NavLink href="/admin/simulator" label="Simulator" icon="🧪" />
          {session?.role === "platform_admin" && (
            <NavLink href="/admin/platform" label="Platform" icon="🏢" />
          )}
        </nav>

        <div className="p-4 border-t border-white/10">
          <form action="/api/admin/auth" method="POST">
            <button
              type="submit"
              className="w-full text-left text-sm text-gray-400 hover:text-white transition-colors px-4 py-2 rounded-lg hover:bg-white/10"
              formMethod="DELETE"
            >
              Log out
            </button>
          </form>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
