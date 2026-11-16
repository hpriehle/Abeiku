import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";
import { CONTACT_EMAIL, LEGAL_UPDATED } from "@/lib/site";

const HEADING_FONT = { fontFamily: "var(--font-heading), Georgia, serif" };

/** Shell for /privacy, /terms, /refunds and /data-deletion: same top bar and footer as the landing page. */
export function LegalPage({ title, intro, children }: { title: string; intro?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-white text-gray-900" style={{ fontFamily: "var(--font-body), system-ui, sans-serif" }}>
      <header className="bg-[#1a1a2e] text-white">
        <nav className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold tracking-tight" style={HEADING_FONT}>
            Abeiku
          </Link>
          <a
            href="/admin/login"
            className="inline-flex items-center min-h-10 px-3 rounded-lg text-sm font-semibold text-white hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white"
          >
            Log in
          </a>
        </nav>
      </header>
      <main className="flex-1 py-10 sm:py-14">
        <article className="max-w-3xl mx-auto px-4 sm:px-6">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight" style={HEADING_FONT}>{title}</h1>
          <p className="mt-2 text-sm text-gray-600">Last updated {LEGAL_UPDATED}</p>
          {intro && <div className="mt-6 text-base text-gray-900 leading-relaxed">{intro}</div>}
          <div className="mt-2">{children}</div>
          <p className="mt-10 text-base text-gray-900">
            Questions? Email <Mail />.
          </p>
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-xl font-semibold tracking-tight" style={HEADING_FONT}>{title}</h2>
      <div className="mt-3 space-y-3 text-base text-gray-900 leading-relaxed">{children}</div>
    </section>
  );
}

export function List({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="list-disc pl-6 space-y-1.5">
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ul>
  );
}

export function Mail() {
  return (
    <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-[#2D4A3E] underline underline-offset-4">
      {CONTACT_EMAIL}
    </a>
  );
}

export function A({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} className="font-semibold text-[#2D4A3E] underline underline-offset-4">
      {children}
    </a>
  );
}
