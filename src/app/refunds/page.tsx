import type { Metadata } from "next";
import { LegalPage, List, Mail, Section } from "@/components/legal/LegalPage";
import { PAYMENT_GRACE_DAYS, PLANS, TRIAL_DAYS } from "@/lib/site";

export const metadata: Metadata = {
  title: "Refunds and cancellation | Abeiku",
  description: "How the Abeiku free trial, cancellation and refunds work.",
  alternates: { canonical: "/refunds" },
};

export default function RefundsPage() {
  const [small, large] = PLANS;
  return (
    <LegalPage title="Refunds and cancellation">
      <Section title="Free trial">
        <List
          items={[
            `Every new hotel gets ${TRIAL_DAYS} days free.`,
            "We ask for a card when you sign up, but charge nothing during the trial. To check a cedi card, Paystack takes GH₵1 and gives it straight back.",
            "Cancel before the trial ends and you pay nothing.",
          ]}
        />
      </Section>

      <Section title="Prices">
        <List
          items={[
            `Up to 5 rooms: GH₵${small.ghs} or $${small.usd} a month.`,
            `6 rooms or more: GH₵${large.ghs} or $${large.usd} a month.`,
            "Pay in cedis by card through Paystack, or in US dollars by card through Stripe. You are charged once a month, starting when the trial ends.",
          ]}
        />
      </Section>

      <Section title="Cancelling">
        <List
          items={[
            "You can cancel any time.",
            "After you cancel, you keep full access until the end of the month you already paid for. Then your plan ends and you are not charged again.",
            "We do not give partial refunds for the unused part of a month.",
          ]}
        />
      </Section>

      <Section title="Failed payments">
        <p>
          If a payment fails, you keep full access for {PAYMENT_GRACE_DAYS} days so you can update your card. After
          that, your admin is locked to the billing page until the payment goes through. Your data is kept.
        </p>
      </Section>

      <Section title="Charged by mistake?">
        <p>
          If we charged you twice or charged you when we should not have, email <Mail /> and we will refund the
          mistaken charge.
        </p>
      </Section>
    </LegalPage>
  );
}
