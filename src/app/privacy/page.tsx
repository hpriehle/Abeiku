import type { Metadata } from "next";
import { A, LegalPage, List, Mail, Section } from "@/components/legal/LegalPage";
import { LEGAL_ENTITY } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy Policy | Abeiku",
  description: "How Abeiku collects, uses, shares, keeps and deletes data, including WhatsApp messages.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro={
        <p>
          Abeiku is software that small hotels and guesthouses in Ghana use to run their bookings and talk to their
          guests. Abeiku is run by {LEGAL_ENTITY} (&quot;we&quot;, &quot;us&quot;). This page explains what data we
          handle, why, who we share it with, how long we keep it and how to have it deleted.
        </p>
      }
    >
      <Section title="Who is responsible for the data">
        <p>
          <strong>Hotel accounts.</strong> For the details of the hotel and its staff who log in to Abeiku, we decide
          how the data is used, so we are responsible for it.
        </p>
        <p>
          <strong>Guest data.</strong> Guest details, bookings and WhatsApp messages belong to the hotel. We process
          them only on the hotel&apos;s behalf and on its instructions, to run the service. The hotel is responsible
          for telling its guests how it uses their data. If you are a guest, you can ask the hotel or us (see
          &quot;Your rights&quot; below).
        </p>
      </Section>

      <Section title="What data we handle">
        <List
          items={[
            <>Hotel account: hotel name, town, number of rooms, contact email, staff names, staff emails and passwords (stored only as a secure hash).</>,
            <>Bookings: guest names, phone numbers, email addresses, booking dates, rooms, prices and notes. These come from the hotel, from the hotel&apos;s own booking page, and from calendars the hotel connects (Google Calendar, Airbnb, Booking.com, VRBO).</>,
            <>WhatsApp: when a hotel connects its WhatsApp Business number, the messages its guests send to that number and the replies the hotel sends, with the guest&apos;s phone number and WhatsApp profile name, and the message time.</>,
            <>Reviews and partners: review requests sent to guests, and the partners (tour operators, agencies) a hotel works with, their contact details and the bookings they send.</>,
            <>Billing: the plan and payment status. Card details go straight to Paystack or Stripe. We never see or store full card numbers.</>,
            <>Technical: a login cookie that keeps you signed in, and basic server logs (such as IP address and time) used for security.</>,
          ]}
        />
        <p>We do not use advertising or tracking cookies, and we do not sell data.</p>
      </Section>

      <Section title="How we use it">
        <List
          items={[
            "To show the hotel all its bookings in one calendar and keep it in sync.",
            "To send the hotel booking alerts by email or WhatsApp (new bookings, cancellations, tomorrow's arrivals).",
            "To show the hotel its guests' WhatsApp messages in one inbox and send the hotel's replies.",
            "To send review requests and track partner bookings and commission, when the hotel uses those features.",
            "To bill the hotel, keep accounts secure and answer support emails.",
          ]}
        />
        <p>We use guest data only to provide the service to the hotel. We do not use it to market to guests.</p>
      </Section>

      <Section title="WhatsApp and Meta">
        <p>
          Abeiku connects to WhatsApp through Meta&apos;s WhatsApp Business Platform (Cloud API). When a hotel connects
          its number:
        </p>
        <List
          items={[
            "Messages between the hotel and its guests pass through Meta, which delivers them and acts as a processor for this. Meta's own terms and privacy policy also apply to WhatsApp.",
            "We receive those messages from Meta and store them so the hotel can read and answer them in Abeiku. We process them only on the hotel's behalf.",
            "We only send WhatsApp messages that the hotel asks us to send: its replies to guests, its booking alerts, and message templates the hotel chooses.",
            "If a hotel turns on automatic replies, the text of incoming guest messages is also sent to Anthropic, an AI provider, to understand the request and draft a reply. This is off unless the hotel turns it on.",
            "We do not use WhatsApp messages for advertising and do not share them with anyone else, except the providers listed below.",
          ]}
        />
        <p>
          A hotel can disconnect WhatsApp at any time in its Meta Business settings, or by emailing <Mail />. To have the
          stored messages deleted, see <A href="/data-deletion">Data deletion</A>.
        </p>
      </Section>

      <Section title="Who we share data with">
        <p>We use these companies to run Abeiku. Each gets only what it needs for its job:</p>
        <List
          items={[
            "Supabase: database and storage.",
            "Netlify: website hosting.",
            "Resend: sending email.",
            "Meta (WhatsApp): sending and receiving WhatsApp messages.",
            "Google: Google Calendar sync and Google sign-in to calendars, when the hotel connects them.",
            "Paystack and Stripe: card payments.",
            "Anthropic: AI for automatic WhatsApp replies, only when a hotel turns them on.",
          ]}
        />
        <p>
          We also share data if the law requires it. Some of these companies store data outside Ghana, including in
          the United States and the European Union. We only use providers that protect data with security measures
          suitable for this kind of data.
        </p>
      </Section>

      <Section title="How long we keep it">
        <List
          items={[
            "We keep a hotel's data, including bookings, guest details and WhatsApp messages, while its account is open.",
            "When a hotel asks us to delete its account or data, we delete it within 30 days.",
            "When a hotel's plan ends and it does not come back, we delete its data within 90 days.",
            "We keep billing records (invoices and payments) as long as tax law requires.",
            "Backups are overwritten on a rolling basis, so deleted data can stay in a backup for a short time before it is gone.",
          ]}
        />
      </Section>

      <Section title="Your rights">
        <p>
          Ghana&apos;s Data Protection Act, 2012 (Act 843) applies to how we handle personal data. Under it you can ask
          to see the personal data we hold about you, to correct it, or to delete it, and you can object to how it is
          used. Email <Mail /> and tell us who you are and what you want. If you are a guest, also tell us the name of
          the hotel. We reply within 30 days.
        </p>
        <p>
          If you are not happy with our answer, you can complain to Ghana&apos;s Data Protection Commission.
        </p>
      </Section>

      <Section title="Security">
        <p>
          Data travels over encrypted connections (HTTPS). Passwords are stored as secure hashes. Each hotel can only
          see its own data. Only people who need to run the service can reach the database.
        </p>
      </Section>

      <Section title="Children">
        <p>Abeiku is for hotel businesses. It is not meant for anyone under 18.</p>
      </Section>

      <Section title="Changes">
        <p>
          If we change this policy, we update the date at the top. If a change matters, we email the hotels that use
          Abeiku before it applies.
        </p>
      </Section>
    </LegalPage>
  );
}
