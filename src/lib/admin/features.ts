// L3: which admin features a hotel sees. A newly signed-up hotel only sees what works for it.
// - Communication (WhatsApp inbox, templates, report): the hotel has its own WhatsApp connected,
//   or is an exempt hotel (Aracuya uses the platform alert sender; Test Hotel is ours).
// - Simulator and the "Dev: Run Onboarding" button: platform admins and exempt hotels only.
// Settings > WhatsApp (Connect) stays visible to everyone: connecting is how a hotel gets the inbox.

import { getSession, type SessionPayload } from "@/lib/admin/auth";
import { getHotelById } from "@/lib/db";

/** Hotels that always see every feature. */
export const FEATURE_EXEMPT_SLUGS: readonly string[] = ["aracuya", "test-hotel"];

export interface FeatureHotel {
  slug?: string | null;
  whatsapp_access_token?: string | null;
  whatsapp_phone_number_id?: string | null;
}

export interface AdminFeatures {
  communication: boolean;
  simulator: boolean;
  devTools: boolean;
}

/** Everything hidden: used when the hotel can't be loaded. */
export const NO_FEATURES: AdminFeatures = { communication: false, simulator: false, devTools: false };

export function whatsappConnected(hotel: FeatureHotel): boolean {
  return Boolean(hotel.whatsapp_access_token && hotel.whatsapp_phone_number_id);
}

export function adminFeatures(hotel: FeatureHotel | null, role?: string | null): AdminFeatures {
  const platformAdmin = role === "platform_admin";
  const exempt = !!hotel?.slug && FEATURE_EXEMPT_SLUGS.includes(hotel.slug);
  const insider = platformAdmin || exempt;
  return {
    communication: exempt || (!!hotel && whatsappConnected(hotel)),
    simulator: insider,
    devTools: insider,
  };
}

/** Loads the features for a session. Never throws: on a DB error only platform-admin features show. */
export async function loadAdminFeatures(session: Pick<SessionPayload, "hotelId" | "role">): Promise<AdminFeatures> {
  try {
    const hotel = await getHotelById(session.hotelId);
    return adminFeatures(hotel, session.role);
  } catch (err) {
    console.error("[features] could not load hotel:", err);
    return adminFeatures(null, session.role);
  }
}

/** For server pages: the features of the logged-in hotel, or null when not logged in. */
export async function currentAdminFeatures(): Promise<AdminFeatures | null> {
  const session = await getSession();
  return session ? loadAdminFeatures(session) : null;
}
