import type { Metadata } from "next";
import Link from "next/link";
import { Bell, CalendarDays, Check, MessageCircle, Users } from "lucide-react";
import { CONTACT_EMAIL, PLANS, SITE_URL, TRIAL_DAYS } from "@/lib/site";
import { SiteFooter } from "@/components/SiteFooter";

// Landing page for hotels and guesthouses in Ghana (L1).
// Only describes what is built. The WhatsApp booking bot is hidden on purpose.
// All text here is listed in docs/l1-landing/COPY.md for approval.

const TITLE = "Abeiku: hotel management for small hotels and guesthouses in Ghana";
const DESCRIPTION =
  "One calendar for every booking from your website, Airbnb, Booking.com, VRBO and Google Calendar. Email alerts for new bookings, cancellations and tomorrow's arrivals. Partner commission tracking. 30 days free.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  metadataBase: new URL(SITE_URL),
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Abeiku",
    title: TITLE,
    description: DESCRIPTION,
    locale: "en_GH",
  },
  twitter: { card: "summary", title: TITLE, description: DESCRIPTION },
};

const HEADING_FONT = { fontFamily: "var(--font-heading), Georgia, serif" };

const FEATURES = [
  {
    icon: CalendarDays,
    title: "One calendar for every booking",
    text: "See bookings from your own website, Google Calendar, Airbnb, VRBO and Booking.com in one place. Add phone and walk-in bookings by hand.",
  },
  {
    icon: Bell,
    title: "Email alerts",
    text: "Get an email when a booking comes in and when one is cancelled. Each evening, get a list of the guests who arrive tomorrow.",
  },
  {
    icon: Users,
    title: "Partners and agencies",
    text: "Track the bookings that tour operators, agencies and other partners send you, and the commission you owe them. Each partner gets their own page with their bookings and what they are owed, in cedis or dollars.",
  },
] as const;

const STEPS = [
  { title: "Sign up", text: `Start your ${TRIAL_DAYS}-day free trial and add your rooms.` },
  { title: "Connect your calendars", text: "Link your Airbnb, Booking.com, VRBO and Google calendars to Abeiku." },
  { title: "See every booking", text: "Your bookings show up in one calendar. New ones keep coming in on their own." },
] as const;

const PLAN_FEATURES = [
  "One calendar for every booking",
  "Email alerts",
  "Partner and commission tracking",
  `${TRIAL_DAYS} days free`,
] as const;

const FAQ = [
  {
    q: "How does the free trial work?",
    a: `You get ${TRIAL_DAYS} days free. We ask for a card when you sign up. We only charge it after the first ${TRIAL_DAYS} days.`,
  },
  {
    q: "How do I pay?",
    a: "Pay in cedis with Paystack, or in US dollars by card.",
  },
  {
    q: "Can I cancel?",
    a: "Yes, cancel at any time. Cancel during the trial and you pay nothing.",
  },
  {
    q: "Do I have to stop using Airbnb or Booking.com?",
    a: "No. Keep using them as you do now. Abeiku shows their bookings next to your own.",
  },
] as const;

function formatGhs(n: number) {
  return `GH₵${n}`;
}

// onDark: the hero sits on navy, where the admin green would not stand out.
function PrimaryCta({ className = "", onDark = false }: { className?: string; onDark?: boolean }) {
  const colors = onDark
    ? "bg-emerald-700 hover:bg-emerald-800 focus-visible:outline-white"
    : "bg-[#2D4A3E] hover:bg-[#1E3329] focus-visible:outline-[#2D4A3E]";
  return (
    <a
      href="/signup"
      className={`inline-flex items-center justify-center min-h-12 px-6 rounded-lg text-white text-base font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 ${colors} ${className}`}
    >
      Start free trial
    </a>
  );
}

export default function Home() {
  return (
    <div
      className="min-h-screen bg-white text-gray-900"
      style={{ fontFamily: "var(--font-body), system-ui, sans-serif" }}
    >
      {/* Top bar */}
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

      <main>
        {/* Hero */}
        <section className="bg-[#1a1a2e] text-white pb-14 pt-8 sm:pt-16 sm:pb-20">
          <div className="max-w-5xl mx-auto px-4 sm:px-6">
            <p className="text-sm font-semibold text-emerald-200">For small hotels and guesthouses in Ghana</p>
            <h1
              className="mt-3 text-3xl sm:text-5xl font-bold tracking-tight leading-tight max-w-3xl"
              style={HEADING_FONT}
            >
              Every booking for your hotel, in one calendar.
            </h1>
            <p className="mt-5 text-lg text-gray-100 leading-relaxed max-w-2xl">
              Abeiku puts the bookings from your website, Airbnb, Booking.com, VRBO and Google Calendar
              in one place. You get an email for every new booking and cancellation.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <PrimaryCta onDark />
              <a
                href="/admin/login"
                className="inline-flex items-center justify-center min-h-12 px-6 rounded-lg border-2 border-white text-white text-base font-semibold hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                Log in
              </a>
            </div>
            <p className="mt-4 text-sm text-gray-200">
              {TRIAL_DAYS} days free. Then from {formatGhs(PLANS[0].ghs)} a month.
            </p>
            <p className="mt-6 text-sm text-gray-200">Used by Aracuya, a guesthouse in Busua.</p>
          </div>
        </section>

        {/* What you get */}
        <section className="py-14 sm:py-20 bg-gray-50" aria-labelledby="features-heading">
          <div className="max-w-5xl mx-auto px-4 sm:px-6">
            <h2 id="features-heading" className="text-2xl sm:text-3xl font-bold tracking-tight" style={HEADING_FONT}>
              What you get
            </h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {FEATURES.map(({ icon: Icon, title, text }) => (
                <div key={title} className="bg-white rounded-xl border border-gray-300 p-5 sm:p-6">
                  <Icon className="w-7 h-7 text-[#2D4A3E]" aria-hidden="true" />
                  <h3 className="mt-3 text-lg font-semibold">{title}</h3>
                  <p className="mt-2 text-base text-gray-700 leading-relaxed">{text}</p>
                </div>
              ))}
              <div className="bg-white rounded-xl border-2 border-dashed border-gray-400 p-5 sm:p-6">
                <div className="flex items-center justify-between gap-3">
                  <MessageCircle className="w-7 h-7 text-[#2D4A3E]" aria-hidden="true" />
                  <span className="rounded-full bg-amber-100 text-amber-900 border border-amber-300 px-3 py-1 text-sm font-semibold">
                    Coming soon
                  </span>
                </div>
                <h3 className="mt-3 text-lg font-semibold">Guest chats in one inbox</h3>
                <p className="mt-2 text-base text-gray-700 leading-relaxed">
                  Read and answer your guests&apos; WhatsApp messages in one inbox. This is not ready yet.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="py-14 sm:py-20" aria-labelledby="how-heading">
          <div className="max-w-5xl mx-auto px-4 sm:px-6">
            <h2 id="how-heading" className="text-2xl sm:text-3xl font-bold tracking-tight" style={HEADING_FONT}>
              How it works
            </h2>
            <ol className="mt-8 grid gap-6 sm:grid-cols-3">
              {STEPS.map((step, i) => (
                <li key={step.title} className="flex sm:flex-col gap-4">
                  <span className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-full bg-[#2D4A3E] text-white text-lg font-bold">
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="text-lg font-semibold">{step.title}</h3>
                    <p className="mt-1 text-base text-gray-700 leading-relaxed">{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Pricing */}
        <section className="py-14 sm:py-20 bg-gray-50" aria-labelledby="pricing-heading">
          <div className="max-w-5xl mx-auto px-4 sm:px-6">
            <h2 id="pricing-heading" className="text-2xl sm:text-3xl font-bold tracking-tight" style={HEADING_FONT}>
              Pricing
            </h2>
            <p className="mt-3 text-base text-gray-700">
              One price by the size of your hotel. Every plan has every feature.
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {PLANS.map((plan) => (
                <div key={plan.name} className="bg-white rounded-xl border border-gray-300 p-5 sm:p-6 flex flex-col">
                  <h3 className="text-lg font-semibold">{plan.name}</h3>
                  <p className="mt-3">
                    <span className="text-4xl font-bold">{formatGhs(plan.ghs)}</span>
                    <span className="text-base text-gray-700"> a month</span>
                  </p>
                  <p className="mt-1 text-base text-gray-700">or ${plan.usd} a month</p>
                  <ul className="mt-5 space-y-2 text-base text-gray-800">
                    {PLAN_FEATURES.map((f) => (
                      <li key={f} className="flex items-start gap-2">
                        <Check className="w-5 h-5 mt-0.5 flex-shrink-0 text-[#2D4A3E]" aria-hidden="true" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <PrimaryCta className="mt-6 w-full" />
                </div>
              ))}
            </div>
            <p className="mt-6 text-base text-gray-700">
              Pay in cedis with Paystack, or in US dollars by card. We charge your card after the first {TRIAL_DAYS} days.
            </p>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-14 sm:py-20" aria-labelledby="faq-heading">
          <div className="max-w-5xl mx-auto px-4 sm:px-6">
            <div className="max-w-3xl">
            <h2 id="faq-heading" className="text-2xl sm:text-3xl font-bold tracking-tight" style={HEADING_FONT}>
              Questions
            </h2>
            <dl className="mt-8 divide-y divide-gray-300 border-y border-gray-300">
              {FAQ.map(({ q, a }) => (
                <div key={q} className="py-5">
                  <dt className="text-lg font-semibold">{q}</dt>
                  <dd className="mt-2 text-base text-gray-700 leading-relaxed">{a}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-8 text-base text-gray-700">
              Another question? Email{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-[#2D4A3E] underline underline-offset-4">
                {CONTACT_EMAIL}
              </a>
              .
            </p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <SiteFooter />
    </div>
  );
}
