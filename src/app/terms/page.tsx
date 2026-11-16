import type { Metadata } from "next";
import { A, LegalPage, List, Mail, Section } from "@/components/legal/LegalPage";
import { LEGAL_ENTITY, PAYMENT_GRACE_DAYS, PLANS, TRIAL_DAYS } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of Service | Abeiku",
  description: "The terms for hotels that use Abeiku.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  const [small, large] = PLANS;
  return (
    <LegalPage
      title="Terms of Service"
      intro={
        <p>
          These terms are the agreement between your hotel and {LEGAL_ENTITY}, which runs Abeiku (&quot;we&quot;,
          &quot;us&quot;). By creating an account or using Abeiku, you agree to them and to
          our <A href="/privacy">Privacy Policy</A>. If you sign up for a hotel, you confirm you are allowed to agree
          for it.
        </p>
      }
    >
      <Section title="What Abeiku does">
        <p>
          Abeiku is hotel software for small hotels and guesthouses. It shows bookings from your own booking page,
          Google Calendar, Airbnb, Booking.com and VRBO in one calendar, sends booking alerts by email or WhatsApp,
          gives you a WhatsApp inbox for guest messages, and helps with reviews and partner bookings. We may improve or
          change features over time.
        </p>
      </Section>

      <Section title="Your account">
        <List
          items={[
            "Give us true details and keep your login safe. You are responsible for what happens under your account, including what your staff do.",
            "Tell us straight away at the email below if you think someone else has used your account.",
          ]}
        />
      </Section>

      <Section title="Free trial and prices">
        <List
          items={[
            `New hotels get ${TRIAL_DAYS} days free. We ask for a card when you sign up, but charge nothing during the trial.`,
            `After the trial, the price is GH₵${small.ghs} or $${small.usd} a month for up to 5 rooms, and GH₵${large.ghs} or $${large.usd} a month for 6 rooms or more.`,
            "You pay in cedis by card through Paystack, or in US dollars by card through Stripe. Your card is charged each month until you cancel.",
            "If we change a price, we email you at least 30 days before it applies to you.",
          ]}
        />
      </Section>

      <Section title="Cancelling and refunds">
        <List
          items={[
            "You can cancel any time. Cancel during the trial and you pay nothing.",
            "If you cancel after paying, you keep access until the end of the month you paid for. We do not give partial refunds for unused time.",
            <>
              See <A href="/refunds">Refunds and cancellation</A> for the details.
            </>,
          ]}
        />
      </Section>

      <Section title="If a payment fails">
        <p>
          If a monthly payment fails, you keep full access for {PAYMENT_GRACE_DAYS} days while you update your card.
          If it is still not paid after that, your admin is locked to the billing page until you pay. Your data is not
          deleted when this happens.
        </p>
      </Section>

      <Section title="Your data and your guests">
        <List
          items={[
            "Your hotel's data, including guest details and messages, stays yours. You give us permission to store and process it only to run Abeiku for you.",
            "You are responsible for having the right to give us your guests' details and for telling guests how you use them, as Ghana's Data Protection Act, 2012 requires.",
            "You can ask us to export or delete your data at any time. See the Privacy Policy and the Data deletion page.",
          ]}
        />
      </Section>

      <Section title="WhatsApp">
        <List
          items={[
            "To use WhatsApp features you connect your own WhatsApp Business number through Meta. You must also follow Meta's WhatsApp Business terms and policies.",
            "Only message guests who have contacted you or agreed to hear from you. Do not use Abeiku to send spam or bulk marketing.",
            "Meta may charge for some messages, may limit or block a number, and may change WhatsApp. We cannot control that.",
          ]}
        />
      </Section>

      <Section title="Fair use">
        <p>Do not use Abeiku to break the law, to harm others, to send spam, or to try to get into other hotels&apos; data or our systems.</p>
      </Section>

      <Section title="Connected services">
        <p>
          Calendar sync depends on Google, Airbnb, Booking.com and VRBO. If they are slow, change, or stop sharing
          bookings, your calendar may be late or incomplete. Always check important bookings on the site they came
          from.
        </p>
      </Section>

      <Section title="Our responsibility">
        <List
          items={[
            "We work hard to keep Abeiku running and correct, but we provide it as it is and cannot promise it will never be down or never have mistakes.",
            "As far as the law allows, we are not responsible for lost bookings, lost profit or indirect loss, and our total responsibility to you is limited to what you paid us in the 12 months before the problem.",
            "Nothing in these terms takes away rights you have by law that cannot be taken away.",
          ]}
        />
      </Section>

      <Section title="Ending the agreement">
        <p>
          You can stop at any time by cancelling. We may suspend or close an account that breaks these terms or does
          not pay, and will tell you by email first unless the problem is serious or urgent.
        </p>
      </Section>

      <Section title="Changes to these terms">
        <p>
          If we change these terms, we update the date at the top and email you before an important change applies.
          If you keep using Abeiku after that, you accept the new terms. Questions about these terms: email <Mail />.
        </p>
      </Section>
    </LegalPage>
  );
}
