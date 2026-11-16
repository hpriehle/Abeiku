import type { Metadata } from "next";
import { A, LegalPage, List, Mail, Section } from "@/components/legal/LegalPage";
import { CONTACT_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Data deletion | Abeiku",
  description: "How to have your data, including WhatsApp messages, deleted from Abeiku.",
  alternates: { canonical: "/data-deletion" },
};

export default function DataDeletionPage() {
  return (
    <LegalPage
      title="Data deletion"
      intro={
        <p>
          You can ask us to delete your data from Abeiku at any time, including WhatsApp messages we received through
          Meta. Here is how.
        </p>
      }
    >
      <Section title="If you are a hotel">
        <ol className="list-decimal pl-6 space-y-1.5">
          <li>
            Email <Mail /> from the email address you log in with. Use the subject &quot;Delete my data&quot;.
          </li>
          <li>Tell us the hotel name and whether you want everything deleted or only part (for example, only WhatsApp messages).</li>
          <li>We reply to confirm it is you, then delete the data within 30 days and email you when it is done.</li>
        </ol>
        <p>
          Deleting everything closes your account. It removes your hotel, staff logins, bookings, guest details,
          WhatsApp messages, reviews and partner records. We keep only billing records that tax law requires us to keep.
        </p>
        <p>
          To also stop WhatsApp messages coming to Abeiku, remove Abeiku&apos;s access to your WhatsApp Business number
          in your Meta Business settings, or ask us to disconnect it in the same email.
        </p>
      </Section>

      <Section title="If you are a guest">
        <p>
          If you booked with, or sent a WhatsApp message to, a hotel that uses Abeiku, you can ask the hotel to delete
          your details, or email <Mail /> yourself. Tell us:
        </p>
        <List
          items={[
            "the name of the hotel,",
            "your name, and the phone number or email address you used with the hotel,",
            "what you want deleted (for example, your WhatsApp messages or your booking details).",
          ]}
        />
        <p>
          We check the request with the hotel, delete your data within 30 days, and reply to tell you it is done. If
          the hotel must keep a record by law (for example, a guest register), we tell you what is kept and why.
        </p>
      </Section>

      <Section title="If you used Facebook or WhatsApp to reach us">
        <p>
          Abeiku does not offer Facebook Login. The only Meta data we hold is WhatsApp messages and the related phone
          number and profile name, received on behalf of hotels. To have them deleted, follow the steps above and
          email {CONTACT_EMAIL}.
        </p>
      </Section>

      <Section title="Backups">
        <p>
          Deleted data can stay in our rolling backups for a short time before those backups are overwritten. We never
          restore it into Abeiku. Read more in our <A href="/privacy">Privacy Policy</A>.
        </p>
      </Section>
    </LegalPage>
  );
}
