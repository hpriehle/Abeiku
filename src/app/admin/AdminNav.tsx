"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin/dashboard", label: "Dashboard", icon: "📊" },
  { href: "/admin/communication", label: "Communication", icon: "💬" },
  { href: "/admin/bookings", label: "Bookings", icon: "📅" },
  { href: "/admin/payments", label: "Payments", icon: "💰" },
  { href: "/admin/rooms", label: "Rooms", icon: "🛏️" },
  { href: "/admin/influencers", label: "Partners", icon: "🔗" },
  { href: "/admin/reviews", label: "Reviews", icon: "⭐" },
  { href: "/admin/settings", label: "Settings", icon: "⚙️" },
  { href: "/admin/simulator", label: "Simulator", icon: "🧪" },
];

/**
 * Admin navigation. Desktop (md+): fixed sidebar. Phone: a top bar with a Menu button that opens
 * the same links, so the page content gets the full width.
 */
export function AdminNav({ hotelName, email, platformAdmin }: { hotelName: string; email: string; platformAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const links = platformAdmin ? [...LINKS, { href: "/admin/platform", label: "Platform", icon: "🏢" }] : LINKS;

  const nav = (
    <nav className="flex-1 p-3 space-y-1" aria-label="Admin">
      {links.map((l) => {
        const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
        return (
          <Link
            key={l.href}
            href={l.href}
            onClick={() => setOpen(false)}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              active ? "bg-white/15 text-white" : "text-gray-200 hover:text-white hover:bg-white/10"
            }`}
          >
            <span className="text-lg" aria-hidden="true">
              {l.icon}
            </span>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );

  const logout = (
    <div className="p-4 border-t border-white/10">
      {/* Plain form POST: the route clears the cookie and redirects to /admin/login. */}
      <form action="/api/admin/auth/logout" method="POST">
        <button
          type="submit"
          className="w-full text-left text-sm font-medium text-gray-200 hover:text-white transition-colors px-4 py-2.5 rounded-lg hover:bg-white/10"
        >
          Log out
        </button>
      </form>
    </div>
  );

  const header = (
    <div className="min-w-0">
      <p className="text-xl font-bold tracking-tight truncate" style={{ fontFamily: "var(--font-heading), Georgia, serif" }}>
        {hotelName}
      </p>
      <p className="text-xs text-gray-300 mt-1 truncate">{email}</p>
    </div>
  );

  return (
    <>
      {/* Phone top bar */}
      <div className="md:hidden bg-[#1a1a2e] text-white shrink-0">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          {header}
          <button
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="admin-mobile-nav"
            className="shrink-0 min-h-11 px-4 rounded-lg border border-white/40 text-sm font-medium hover:bg-white/10"
          >
            {open ? "Close" : "Menu"}
          </button>
        </div>
        {open && (
          <div id="admin-mobile-nav" className="border-t border-white/10 flex flex-col">
            {nav}
            {logout}
          </div>
        )}
      </div>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 bg-[#1a1a2e] text-white flex-col shrink-0">
        <div className="p-6 border-b border-white/10">{header}</div>
        {nav}
        {logout}
      </aside>
    </>
  );
}
