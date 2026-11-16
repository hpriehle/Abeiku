import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL } from "@/lib/site";
import { signupOpen } from "@/lib/billing/flags";
import { SignupWizard } from "./SignupWizard";
import { SignupShell, H1_FONT } from "./SignupShell";

// L2: self-serve sign-up with a 30-day free trial and a card on file. Behind SIGNUP_OPEN
// (default off): until Harrison says go, this page stays the L1 "opens soon" placeholder.

export const dynamic = "force-dynamic"; // read SIGNUP_OPEN at request time

export const metadata: Metadata = {
  title: "Sign up | Abeiku",
  description: "Start your 30-day free trial of Abeiku.",
};

export default function SignupPage() {
  if (signupOpen()) return <SignupWizard />;

  return (
    <SignupShell footer={false}>
      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={H1_FONT}>
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
    </SignupShell>
  );
}
