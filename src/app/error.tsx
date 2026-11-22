"use client";

import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";

const HEADING_FONT = { fontFamily: "var(--font-heading), Georgia, serif" };

// Same look and wording as not-found.tsx and the existing "Something went wrong" messages.
export default function ErrorPage() {
  return (
    <div className="min-h-screen flex flex-col bg-white text-gray-900" style={{ fontFamily: "var(--font-body), system-ui, sans-serif" }}>
      <header className="bg-[#1a1a2e] text-white">
        <nav className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center">
          <Link href="/" className="text-xl font-bold tracking-tight" style={HEADING_FONT}>
            Abeiku
          </Link>
        </nav>
      </header>
      <main className="flex-1 flex items-center">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 text-center">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight" style={HEADING_FONT}>
            Something went wrong. Please try again.
          </h1>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/"
              className="inline-flex items-center justify-center min-h-12 px-6 rounded-lg bg-[#2D4A3E] text-white text-base font-semibold hover:bg-[#1E3329] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2D4A3E]"
            >
              Go to the home page
            </Link>
            <a
              href="/admin/login"
              className="inline-flex items-center justify-center min-h-12 px-6 rounded-lg border border-[#868e9c] bg-white text-base font-semibold text-gray-800 hover:bg-gray-50"
            >
              Hotel log in
            </a>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
