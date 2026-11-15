"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BedDouble,
  Building2,
  CalendarDays,
  CalendarRange,
  ChevronsLeft,
  ChevronsRight,
  FlaskConical,
  LayoutDashboard,
  Link2,
  LogOut,
  Menu,
  MessageSquare,
  Settings,
  Star,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";

type NavLink = { href: string; label: string; icon: LucideIcon };

const LINKS: NavLink[] = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/communication", label: "Communication", icon: MessageSquare },
  { href: "/admin/calendar", label: "Calendar", icon: CalendarRange },
  { href: "/admin/bookings", label: "Bookings", icon: CalendarDays },
  { href: "/admin/payments", label: "Payments", icon: Wallet },
  { href: "/admin/rooms", label: "Rooms", icon: BedDouble },
  { href: "/admin/influencers", label: "Partners", icon: Link2 },
  { href: "/admin/reviews", label: "Reviews", icon: Star },
  { href: "/admin/settings", label: "Settings", icon: Settings },
  { href: "/admin/simulator", label: "Simulator", icon: FlaskConical },
];

const COLLAPSE_KEY = "abeiku-admin-nav-collapsed";

/**
 * Admin navigation.
 * - Phone (< md): a sticky top bar with a Menu button that opens the links in a drawer over the page
 *   (backdrop, Escape and any link close it), so page content always gets the full width.
 * - Desktop (md+): a sidebar that can be collapsed to icons only (remembered in localStorage).
 */
export function AdminNav({ hotelName, email, platformAdmin }: { hotelName: string; email: string; platformAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const links = platformAdmin ? [...LINKS, { href: "/admin/platform", label: "Platform", icon: Building2 }] : LINKS;

  useEffect(() => {
    // Read the saved preference after mount (localStorage is not available during server render).
    if (localStorage.getItem(COLLAPSE_KEY) === "1") setCollapsed(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function toggleCollapsed() {
    setCollapsed((c) => {
      localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      return !c;
    });
  }

  const nav = (compact: boolean) => (
    <nav className="flex-1 p-3 space-y-1 overflow-y-auto" aria-label="Admin">
      {links.map((l) => {
        const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
        const Icon = l.icon;
        return (
          <Link
            key={l.href}
            href={l.href}
            onClick={() => setOpen(false)}
            aria-current={active ? "page" : undefined}
            title={compact ? l.label : undefined}
            className={`flex items-center gap-3 rounded-lg text-sm font-medium transition-colors min-h-11 ${
              compact ? "justify-center px-0" : "px-4"
            } ${active ? "bg-white/15 text-white" : "text-gray-200 hover:text-white hover:bg-white/10"}`}
          >
            <Icon className="size-5 shrink-0" aria-hidden="true" strokeWidth={1.75} />
            <span className={compact ? "sr-only" : ""}>{l.label}</span>
          </Link>
        );
      })}
    </nav>
  );

  const logout = (compact: boolean) => (
    <div className="p-3 border-t border-white/10">
      {/* Plain form POST: the route clears the cookie and redirects to /admin/login. */}
      <form action="/api/admin/auth/logout" method="POST">
        <button
          type="submit"
          title={compact ? "Log out" : undefined}
          className={`w-full flex items-center gap-3 min-h-11 text-sm font-medium text-gray-200 hover:text-white transition-colors rounded-lg hover:bg-white/10 ${
            compact ? "justify-center" : "px-4"
          }`}
        >
          <LogOut className="size-5 shrink-0" aria-hidden="true" strokeWidth={1.75} />
          <span className={compact ? "sr-only" : ""}>Log out</span>
        </button>
      </form>
    </div>
  );

  const header = (
    <div className="min-w-0">
      <p className="text-lg md:text-xl font-bold tracking-tight truncate" style={{ fontFamily: "var(--font-heading), Georgia, serif" }}>
        {hotelName}
      </p>
      <p className="text-xs text-gray-300 mt-0.5 truncate">{email}</p>
    </div>
  );

  return (
    <>
      {/* Phone top bar */}
      <div className="md:hidden sticky top-0 z-30 bg-[#1a1a2e] text-white shrink-0">
        <div className="flex items-center justify-between gap-3 px-4 py-2.5">
          {header}
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-expanded={open}
            aria-controls="admin-mobile-nav"
            className="shrink-0 inline-flex items-center gap-2 min-h-11 px-3 rounded-lg border border-white/50 text-sm font-medium hover:bg-white/10"
          >
            <Menu className="size-5" aria-hidden="true" />
            Menu
          </button>
        </div>
      </div>

      {/* Phone drawer */}
      {open && (
        <div className="md:hidden fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Admin menu">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div id="admin-mobile-nav" className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-[#1a1a2e] text-white flex flex-col shadow-xl">
            <div className="flex items-start justify-between gap-3 p-4 border-b border-white/10">
              {header}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="shrink-0 inline-flex items-center justify-center size-11 -m-1 rounded-lg hover:bg-white/10"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>
            {nav(false)}
            {logout(false)}
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside
        className={`hidden md:flex ${collapsed ? "w-[72px]" : "w-64"} bg-[#1a1a2e] text-white flex-col shrink-0 transition-[width] duration-200`}
      >
        <div className={`border-b border-white/10 flex items-start gap-2 ${collapsed ? "p-3 justify-center" : "p-6 pr-3 justify-between"}`}>
          {!collapsed && header}
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand menu" : "Collapse menu"}
            title={collapsed ? "Expand menu" : "Collapse menu"}
            className="shrink-0 inline-flex items-center justify-center size-9 rounded-lg text-gray-200 hover:text-white hover:bg-white/10"
          >
            {collapsed ? <ChevronsRight className="size-5" aria-hidden="true" /> : <ChevronsLeft className="size-5" aria-hidden="true" />}
          </button>
        </div>
        {nav(collapsed)}
        {logout(collapsed)}
      </aside>
    </>
  );
}
