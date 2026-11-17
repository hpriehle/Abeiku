// GET /api/partner/stats logic: the partner dashboard for one hotel of the session's account,
// plus the list of the account's hotels for the switcher. I/O is injected so this is testable.

import type { ReferralBookingRow } from "./booking-report";
import { membershipsForSession, type AccountStore, type Membership, type SessionRef } from "./accounts";
import { todayInGhana, totalsFor } from "./commission";
import { bookingView, partnerLink, partnerSiteUrl } from "./views";
import type { HandlerResult } from "./bulk";

export interface HotelRef {
  id: string;
  slug: string;
  name: string;
}

export interface DashboardDeps {
  store: AccountStore;
  getHotel(id: string): Promise<HotelRef | null>;
  listBookings(influencerId: string): Promise<ReferralBookingRow[]>;
  countClicks(influencerId: string): Promise<number>;
  now?: Date;
}

export async function handlePartnerStats(
  session: SessionRef | null,
  /** Hotel slug picked in the switcher; default: the session's hotel. */
  hotelSlug: string | null,
  deps: DashboardDeps
): Promise<HandlerResult> {
  if (!session) return { status: 401, body: { error: "Unauthorized" } };

  const memberships = await membershipsForSession(session, deps.store);
  const withHotel = (
    await Promise.all(
      memberships.map(async (m) => {
        const hotel = await deps.getHotel(m.hotel_id);
        return hotel ? { m, hotel } : null;
      })
    )
  ).filter((x): x is { m: Membership; hotel: HotelRef } => Boolean(x));
  if (withHotel.length === 0) return { status: 404, body: { error: "Not found" } };

  const picked =
    (hotelSlug ? withHotel.find((x) => x.hotel.slug === hotelSlug) : undefined) ??
    withHotel.find((x) => x.m.id === session.influencerId) ??
    withHotel[0];
  const { m: partner, hotel } = picked;

  const [rows, clicks] = await Promise.all([deps.listBookings(partner.id), deps.countClicks(partner.id)]);
  const today = todayInGhana(deps.now);

  return {
    status: 200,
    body: {
      name: partner.name,
      email: partner.email,
      code: partner.slug,
      // Null when the hotel has no partner site yet; the dashboard says so instead of a wrong link.
      link_url: partnerLink(partner.slug, partnerSiteUrl(hotel.slug)),
      currency: partner.currency,
      commission_kind: partner.commission_kind,
      commission_value: Number(partner.commission_value),
      clicks,
      totals: totalsFor(rows.map((r) => ({ ...r, commission_amount: Number(r.commission_amount) })), today),
      // Partners see dates, nights, status and their commission; not guest amounts.
      bookings: rows.map((r) => {
        const v = bookingView(r, null, today);
        return {
          id: v.id,
          booking_ref: v.booking_ref,
          check_in: v.check_in,
          check_out: v.check_out,
          nights: v.nights,
          status: v.status,
          commission: v.commission,
          payout_paid_at: v.payout_paid_at,
        };
      }),
      hotel: { slug: hotel.slug, name: hotel.name },
      /** Every hotel of the account; the dashboard shows a switcher when there are 2+. */
      hotels: withHotel.map((x) => ({ slug: x.hotel.slug, name: x.hotel.name })),
    },
  };
}
