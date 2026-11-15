import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL } from "@/lib/site";

// Placeholder until L2 builds sign-up with the free trial and card on file.
// /api/signup still exists and is left untouched for L2.

export const metadata: Metadata = {
  title: "Sign up | Abeiku",
  description: "Sign-up for Abeiku opens soon.",
};

export default function SignupPage() {
  return (
    <div
      className="min-h-screen flex items-center justify-center bg-[#1a1a2e] p-4"
      style={{ fontFamily: "var(--font-body), system-ui, sans-serif" }}
    >
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg p-6 sm:p-8 text-gray-900">
        <h1
          className="text-2xl sm:text-3xl font-bold tracking-tight"
          style={{ fontFamily: "var(--font-heading), Georgia, serif" }}
        >
          Sign-up opens soon
        </h1>
        <p className="mt-3 text-base text-gray-700 leading-relaxed">
          Sign-up for Abeiku is not open yet. To hear when it opens, or to ask a question, email us.
        </p>
        <a
          href={`mailto:${CONTACT_EMAIL}`}
          className="mt-6 inline-flex w-full items-center justify-center min-h-12 px-5 rounded-lg bg-[#2D4A3E] text-white text-base font-semibold hover:bg-[#1E3329] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2D4A3E]"
        >
          {CONTACT_EMAIL}
        </a>
        <div className="mt-6 flex justify-between text-sm font-medium">
          <Link href="/" className="text-[#2D4A3E] underline underline-offset-4">Back to home</Link>
          <a href="/admin/login" className="text-[#2D4A3E] underline underline-offset-4">Log in</a>
        </div>
      </div>
    </div>
  );
}
