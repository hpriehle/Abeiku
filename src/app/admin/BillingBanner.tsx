import Link from "next/link";
import type { Banner } from "@/lib/billing/access";

export function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Accra" });
}

/** One line above every admin page: trial days left, a failed payment, or a plan that ends soon. */
export function BillingBanner({ banner }: { banner: NonNullable<Banner> }) {
  if (banner.kind === "past_due") {
    return (
      <div role="alert" className="border-b border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 sm:px-6">
        {banner.locked ? (
          <><strong>Your account is locked because your last payment failed.</strong> Update your card to open it again.</>
        ) : banner.lockAt ? (
          <><strong>Your last payment failed.</strong> Update your card by {formatDay(banner.lockAt)} to keep access.</>
        ) : (
          <><strong>Your last payment failed.</strong> Update your card soon to keep access.</>
        )}{" "}
        {/* A plain link: the route redirects to Stripe or Paystack. */}
        <a href="/api/admin/billing/card" className="font-semibold underline underline-offset-4">Update card</a>
      </div>
    );
  }
  if (banner.kind === "canceled") {
    return (
      <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 sm:px-6">
        Your plan is cancelled.{" "}
        {banner.endsAt ? <>You can use Abeiku until {formatDay(banner.endsAt)}.</> : null}{" "}
        <Link href="/admin/plan" className="font-semibold underline underline-offset-4">See your plan</Link>
      </div>
    );
  }
  const days = banner.daysLeft;
  return (
    <div className="border-b border-green-200 bg-green-50 px-4 py-3 text-sm text-green-950 sm:px-6">
      Free trial: {days === 1 ? "1 day" : `${days} days`} left. Your card is charged on {formatDay(banner.endsAt)}.{" "}
      <Link href="/admin/plan" className="font-semibold underline underline-offset-4">See your plan</Link>
    </div>
  );
}
