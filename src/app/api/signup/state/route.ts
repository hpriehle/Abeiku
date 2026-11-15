// GET /api/signup/state: where the signed-in owner is in sign-up, for the /signup page.

import { NextResponse } from "next/server";
import { getHotelById } from "@/lib/db";
import { billingDeps } from "@/lib/billing";
import { billingView, sessionBillingClaim } from "@/lib/billing/access";
import { setAdminSession } from "@/lib/billing/session";
import { resumePendingSetup } from "@/lib/billing/flow";
import { errorResponse, requireSession } from "@/lib/billing/route-helpers";

export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  try {
    let hotel = await getHotelById(session.hotelId);
    if (!hotel) return NextResponse.json({ error: "Please log in again." }, { status: 401 });

    // Came back from the card page another way (closed the tab, new device): finish it now.
    if (hotel.billing_status === "pending_card" && hotel.billing_setup_ref) {
      if (await resumePendingSetup(billingDeps(), hotel.id)) hotel = (await getHotelById(session.hotelId)) ?? hotel;
    }

    const view = billingView(hotel);
    const res = NextResponse.json({
      hotel: {
        name: hotel.name,
        town: hotel.location_city ?? "",
        rooms: hotel.room_count ?? null,
        contactEmail: hotel.contact_email ?? "",
        calendars: hotel.calendar_links ?? null,
      },
      billing: {
        access: view.access,
        status: view.status,
        tier: view.tier,
        provider: view.provider,
        trialEndsAt: view.trialEndsAt,
        legacy: view.legacy,
        exempt: view.exempt,
      },
    });
    // Keep the session's billing block in step with the database.
    if (sessionBillingClaim(view) !== session.billing) {
      const { userId, hotelId, email, hotelName, role } = session;
      await setAdminSession(res, { userId, hotelId, email, hotelName, role }, view);
    }
    return res;
  } catch (err) {
    return errorResponse(err, "state");
  }
}
