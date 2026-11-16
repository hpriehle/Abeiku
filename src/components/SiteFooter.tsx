import { CONTACT_EMAIL, LEGAL_ENTITY, LEGAL_LINKS } from "@/lib/site";

/** Navy footer for the public pages (landing, legal pages, 404). */
export function SiteFooter() {
  const link = "underline underline-offset-4 hover:text-white";
  return (
    <footer className="bg-[#1a1a2e] text-gray-100">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-4 text-sm">
        <nav className="flex flex-wrap gap-x-6 gap-y-2" aria-label="Footer">
          <a href="/signup" className={link}>Start free trial</a>
          <a href="/admin/login" className={link}>Hotel log in</a>
          <a href="/partner/login" className={link}>Partner log in</a>
          <a href={`mailto:${CONTACT_EMAIL}`} className={link}>{CONTACT_EMAIL}</a>
        </nav>
        <nav className="flex flex-wrap gap-x-6 gap-y-2" aria-label="Legal">
          {LEGAL_LINKS.map((l) => (
            <a key={l.href} href={l.href} className={link}>{l.label}</a>
          ))}
        </nav>
        <span>&copy; {new Date().getFullYear()} Abeiku, run by {LEGAL_ENTITY}</span>
      </div>
    </footer>
  );
}
