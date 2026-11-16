import Link from "next/link";
import { LEGAL_LINKS } from "@/lib/site";

/** Navy page with one white card, same look as the admin login and the L1 placeholder. */
export function SignupShell({ children, footer = true }: { children: React.ReactNode; footer?: boolean }) {
  return (
    <div
      className="min-h-screen flex items-start sm:items-center justify-center bg-[#1a1a2e] px-4 py-6 sm:py-10"
      style={{ fontFamily: "var(--font-body), system-ui, sans-serif" }}
    >
      <div className="w-full max-w-md">
        <Link href="/" className="block mb-4 text-xl font-bold tracking-tight text-white" style={{ fontFamily: "var(--font-heading), Georgia, serif" }}>
          Abeiku
        </Link>
        <div className="bg-white rounded-xl shadow-lg p-5 sm:p-8 text-gray-900">{children}</div>
        {footer && (
          <p className="mt-4 text-center text-sm text-gray-200">
            Already have an account?{" "}
            <a href="/admin/login" className="font-semibold text-white underline underline-offset-4">Log in</a>
          </p>
        )}
        <nav aria-label="Legal" className="mt-4 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-gray-200">
          {LEGAL_LINKS.map((l) => (
            <a key={l.href} href={l.href} className="underline underline-offset-4 hover:text-white">{l.label}</a>
          ))}
        </nav>
      </div>
    </div>
  );
}

export const H1_FONT = { fontFamily: "var(--font-heading), Georgia, serif" };
