"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/admin/communication/inbox", label: "Inbox" },
  { href: "/admin/communication/report", label: "Report" },
  { href: "/admin/communication/templates", label: "Templates" },
];

export default function CommunicationLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="p-8">
      <h2
        className="text-2xl font-bold text-gray-900 mb-6"
        style={{ fontFamily: "var(--font-heading), Georgia, serif" }}
      >
        Communication
      </h2>

      {/* Horizontal tab bar */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-6">
          {tabs.map((tab) => {
            const isActive =
              pathname === tab.href ||
              (tab.href === "/admin/communication/inbox" && pathname === "/admin/communication");

            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`pb-3 text-sm font-medium transition-colors ${
                  isActive
                    ? "border-b-2 border-[#2D4A3E] text-[#2D4A3E]"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {children}
    </div>
  );
}
