import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/admin/auth";
import { loadBillingView } from "@/lib/billing";
import { formatPrice, tierLabel, tierForRooms } from "@/lib/billing/plans";
import { CONTACT_EMAIL } from "@/lib/site";
import { formatDay } from "../BillingBanner";
import { PlanActions } from "./PlanActions";

export const metadata: Metadata = { title: "Plan" };

const STATUS_TEXT: Record<string, string> = {
  pending_card: "No card yet",
  trialing: "Free trial",
  active: "Paid",
  past_due: "Payment failed",
  canceled: "Cancelled",
};

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-3 border-b border-gray-200 last:border-0 sm:flex-row sm:justify-between sm:gap-4">
      <dt className="text-sm text-gray-600">{label}</dt>
      <dd className="text-base font-medium text-gray-900 sm:text-right">{value}</dd>
    </div>
  );
}

export default async function PlanPage() {
  const session = await getSession();
  if (!session) redirect("/admin/login");
  const v = await loadBillingView(session.hotelId);

  if (v.exempt || v.legacy) {
    return (
      <div className="admin-page-narrow">
        <h1 className="admin-h1">Plan</h1>
        <div className="admin-card mt-6">
          <p className="text-base text-gray-800">This account is not billed. Nothing to pay.</p>
        </div>
      </div>
    );
  }

  const tier = v.tier ?? (v.roomCount ? tierForRooms(v.roomCount) : null);
  const price = tier && v.currency ? `${formatPrice(tier, v.currency)} a month` : "Not chosen yet";
  const nextCharge =
    v.status === "trialing" && v.trialEndsAt
      ? formatDay(v.trialEndsAt)
      : (v.status === "active" || v.status === "past_due") && v.periodEnd
        ? formatDay(v.periodEnd)
        : "None";

  return (
    <div className="admin-page-narrow">
      <h1 className="admin-h1">Plan</h1>
      <p className="admin-subtitle">Your Abeiku plan and card.</p>

      <div className="admin-card mt-6">
        <dl>
          <Row label="Status" value={v.status ? STATUS_TEXT[v.status] : "Unknown"} />
          {v.status === "trialing" && (
            <Row label="Trial days left" value={`${v.trialDaysLeft} ${v.trialDaysLeft === 1 ? "day" : "days"}`} />
          )}
          <Row label="Rooms" value={v.roomCount ?? "Not set"} />
          <Row label="Plan" value={tier ? tierLabel(tier) : "Not set"} />
          <Row label="Price" value={price} />
          <Row label="Paid by" value={v.provider === "paystack" ? "Card in cedis (Paystack)" : v.provider === "stripe" ? "Card in dollars (Stripe)" : "Not chosen yet"} />
          <Row label="Next charge" value={nextCharge} />
          {v.status === "canceled" && v.periodEnd && <Row label="Access until" value={formatDay(v.periodEnd)} />}
        </dl>
      </div>

      {v.status === "past_due" && (
        <div className="admin-error mt-4" role="alert">
          Your last payment did not go through. Make sure your card has money on it and has not expired. To use
          a new card, email {CONTACT_EMAIL}.
        </div>
      )}

      <PlanActions
        status={v.status}
        roomCount={v.roomCount}
        currency={v.currency}
        trialEndsAt={v.trialEndsAt ? formatDay(v.trialEndsAt) : null}
      />
    </div>
  );
}
