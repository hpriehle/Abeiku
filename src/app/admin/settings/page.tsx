import { CalendarRange, CreditCard } from "lucide-react";
import { listHotelFeeds } from "@/lib/db/hotel-feeds";
import { SYNC_HOTEL_SLUG } from "@/lib/bookings/feeds";
import { redirect } from "next/navigation";
import { hotelView } from "@/lib/admin/hotel-view";
import Link from "next/link";
import { getSession } from "@/lib/admin/auth";
import { getHotelById, getOAuthToken, getNotificationPreferences, getNotificationLog } from "@/lib/db";
import { SettingsForm } from "./SettingsForm";
import { AlertEmailForm } from "./AlertEmailForm";
import { alertEmailOf } from "@/lib/db/alert-email";
import { AlertWhatsAppForm } from "./AlertWhatsAppForm";
import { alertWhatsAppOf } from "@/lib/db/alert-whatsapp";
import { NotificationSettings } from "./notifications/NotificationSettings";
import { adminFeatures } from "@/lib/admin/features";

function WhatsAppLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function GoogleCalendarLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" fill="#fff" />
      <path d="M3 8h18" stroke="#4285F4" strokeWidth="1.5" />
      <rect x="3" y="4" width="18" height="4" rx="2" fill="#4285F4" />
      <path d="M8 2v4M16 2v4" stroke="#4285F4" strokeWidth="1.5" strokeLinecap="round" />
      <text x="12" y="17.5" textAnchor="middle" fontSize="7" fontWeight="bold" fill="#4285F4">17</text>
    </svg>
  );
}

function MTNLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="11" fill="#FFCC00" />
      <text x="12" y="16" textAnchor="middle" fontSize="9" fontWeight="bold" fill="#003" fontFamily="sans-serif">MTN</text>
    </svg>
  );
}

function GoogleBusinessLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path d="M12 2L3 7v10l9 5 9-5V7l-9-5z" fill="#4285F4"/>
      <path d="M12 2L3 7l9 5 9-5-9-5z" fill="#EA4335"/>
      <path d="M3 7v10l9 5V12L3 7z" fill="#FBBC05"/>
      <path d="M21 7v10l-9 5V12l9-5z" fill="#34A853"/>
      <circle cx="12" cy="11" r="2.5" fill="white"/>
    </svg>
  );
}

function InfoTooltip({ text }: { text: string }) {
  return (
    <span className="relative group/tip">
      <span
        tabIndex={0}
        aria-label={text}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-[#868e9c] text-[9px] font-medium text-gray-600 cursor-help"
      >
        i
      </span>
      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1.5 bg-gray-900 text-white text-[10px] rounded-md w-max max-w-[14rem] whitespace-normal hidden pointer-events-none group-hover/tip:block group-focus-within/tip:block z-10" aria-hidden="true">
        {text}
        <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
      </span>
    </span>
  );
}

function ServiceTile({
  logo,
  name,
  tooltip,
  connected,
  statusLabel,
  href,
  comingSoon,
}: {
  logo: React.ReactNode;
  name: string;
  tooltip: string;
  connected: boolean;
  statusLabel: string;
  href?: string;
  comingSoon?: boolean;
}) {
  const content = (
    <div
      className={`bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-col items-center text-center ${
        !comingSoon ? "hover:border-gray-300 hover:shadow-md transition-all group" : "bg-gray-50"
      }`}
    >
      <div className={`w-10 h-10 flex items-center justify-center mb-2 ${comingSoon ? "opacity-60 grayscale" : ""}`}>
        {logo}
      </div>
      <div className="flex items-center gap-1 mb-3">
        <h3 className="text-xs font-semibold text-gray-900">{name}</h3>
        <InfoTooltip text={tooltip} />
      </div>
      {comingSoon ? (
        <span className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-[10px] font-medium">
          Coming soon
        </span>
      ) : (
        <span className="px-3 py-1.5 bg-[#2D4A3E] text-white rounded-lg text-[10px] font-medium group-hover:bg-[#1E3329] transition-colors">
          Configure
        </span>
      )}
      <div className="flex items-center gap-1 mt-2">
        <span
          className={`inline-block w-1.5 h-1.5 rounded-full ${
            comingSoon ? "bg-gray-300" : connected ? "bg-green-500" : "bg-yellow-400"
          }`}
        />
        <span className={`text-[10px] font-medium ${
          comingSoon ? "text-gray-500" : connected ? "text-green-700" : "text-amber-700"
        }`}>
          {comingSoon ? "Unavailable" : statusLabel}
        </span>
      </div>
    </div>
  );

  if (comingSoon || !href) return content;

  return <Link href={href}>{content}</Link>;
}

const CALENDAR_ERRORS: Record<string, string> = {
  access_denied: "Google Calendar was not connected: access was not allowed.",
  state_mismatch: "Google Calendar was not connected: the sign-in link had expired or was not started here. Please try again.",
  token_exchange: "Google Calendar was not connected: Google did not accept the sign-in. Please try again.",
  no_code: "Google Calendar was not connected. Please try again.",
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ calendar?: string; reason?: string }>;
}) {
  const { calendar, reason } = await searchParams;
  const calendarNotice =
    calendar === "connected"
      ? { ok: true, text: "Google Calendar connected." }
      : calendar === "error"
        ? { ok: false, text: CALENDAR_ERRORS[reason ?? ""] ?? "Google Calendar was not connected. Please try again." }
        : null;
  const session = await getSession();
  if (!session) redirect("/admin/login");

  const [hotel, oauthToken, preferences, recentLog, feedCount] = await Promise.all([
    getHotelById(session.hotelId),
    getOAuthToken(session.hotelId, "google"),
    getNotificationPreferences(session.hotelId),
    getNotificationLog(session.hotelId, 20),
    // null before docs/l2-feeds/calendar-feeds.sql has run
    listHotelFeeds(session.hotelId).then((f) => f.length).catch(() => null),
  ]);

  if (!hotel) redirect("/admin/login");

  const waConnected = !!hotel.whatsapp_access_token;
  const googleConnected = !!oauthToken;
  const momoConnected = hotel.momo_phone_verified;
  const paystackConnected = !!hotel.paystack_subaccount_code;
  const googleReviewsConnected = !!hotel.google_place_id;
  const features = adminFeatures(hotel, session.role);

  return (
    <div className="admin-page">
      <div className="flex items-center justify-between mb-6">
        <h1 className="admin-h1">Settings</h1>
        <Link href="/admin/settings/account" className="admin-btn-secondary text-sm ml-auto mr-3">
          Login email and password
        </Link>
        {/* L3: platform admins and exempt hotels only */}
        {features.devTools && (
        <a
          href="/admin/onboarding"
          className="px-4 py-2 border border-dashed border-orange-300 text-orange-700 rounded-lg text-xs font-medium hover:bg-orange-50 transition-colors"
        >
          Dev: Run Onboarding
        </a>
        )}
      </div>

      {calendarNotice && (
        <p role={calendarNotice.ok ? "status" : "alert"} className={`${calendarNotice.ok ? "admin-success" : "admin-error"} mb-6`}>
          {calendarNotice.text}
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Left column: Hotel Info + Notifications */}
        <div className="space-y-6">
          <SettingsForm hotel={hotelView(hotel)} />
          <AlertEmailForm {...alertEmailOf(hotel as unknown as Record<string, unknown>)} />
          <AlertWhatsAppForm {...alertWhatsAppOf(hotel as unknown as Record<string, unknown>)} />
          <NotificationSettings hotel={hotelView(hotel)} preferences={preferences} recentLog={recentLog} />
        </div>

        {/* Right column: Connected Services */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Connected Services</h3>
          <div className="grid grid-cols-2 gap-3">
            <ServiceTile
              logo={<CalendarRange className="size-8 text-[#2D4A3E] shrink-0" aria-hidden="true" />}
              name="Calendars"
              tooltip="Bring in bookings from Airbnb, Booking.com, VRBO and Google calendar"
              connected={hotel.slug === SYNC_HOTEL_SLUG || (feedCount ?? 0) > 0}
              statusLabel={
                hotel.slug === SYNC_HOTEL_SLUG
                  ? "Set up by Abeiku"
                  : feedCount
                    ? `${feedCount} connected`
                    : "Not connected"
              }
              href="/admin/settings/calendars"
            />
            {features.whatsappSetup && (
            <ServiceTile
              logo={<WhatsAppLogo className="w-8 h-8 text-[#25D366]" />}
              name="WhatsApp"
              tooltip="Send automated messages to guests via WhatsApp"
              connected={waConnected}
              statusLabel={waConnected ? "Connected" : "Not configured"}
              href="/admin/settings/whatsapp"
            />
            )}
            <ServiceTile
              logo={<GoogleCalendarLogo className="w-8 h-8" />}
              name="Google Calendar"
              tooltip="Sync bookings with Google Calendar automatically"
              connected={googleConnected}
              statusLabel={googleConnected ? "Connected" : "Not connected"}
              href="/admin/settings/google"
            />
            <ServiceTile
              logo={<MTNLogo className="w-8 h-8" />}
              name="MTN Mobile Money"
              tooltip="Receive guest payment disbursements via MoMo"
              connected={momoConnected}
              statusLabel={momoConnected ? "Verified" : hotel.momo_phone ? "Pending verification" : "Not configured"}
              href="/admin/settings/momo"
            />
            <ServiceTile
              logo={<CreditCard className="size-8 text-[#2D4A3E] shrink-0" aria-hidden="true" />}
              name="Card Payments"
              tooltip="Accept card payments from guests with automatic payouts"
              connected={paystackConnected}
              statusLabel={paystackConnected ? "Connected" : "Not configured"}
              href="/admin/settings/paystack"
            />
            <ServiceTile
              logo={<GoogleBusinessLogo className="w-8 h-8" />}
              name="Google Reviews"
              tooltip="Connect your Google Business Profile for review management"
              connected={googleReviewsConnected}
              statusLabel={googleReviewsConnected ? "Connected" : "Not configured"}
              href="/admin/settings/google-reviews"
            />
            <ServiceTile
              logo={
                <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none">
                  <path d="M20 18h-2V9.25L12 13 6 9.25V18H4V6h1.2l6.8 4.25L18.8 6H20v12z" fill="#EA4335"/>
                  <rect x="2" y="4" width="20" height="16" rx="2" stroke="#EA4335" strokeWidth="1.2" fill="none"/>
                </svg>
              }
              name="Gmail"
              tooltip="Send booking confirmations and receipts via Gmail"
              connected={false}
              statusLabel="Not configured"
              comingSoon
            />
          </div>
        </div>
      </div>
    </div>
  );
}
