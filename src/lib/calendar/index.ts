// Google Calendar library — uses OAuth tokens to check availability and manage events

import { google, calendar_v3 } from "googleapis";
import { getOAuthToken, upsertOAuthToken } from "@/lib/db";
import { getHotelId, getHotel } from "@/lib/hotel-context";

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/google/callback`
  );
}

/** Get an authenticated calendar client using stored OAuth tokens. */
async function getCalendarClient(): Promise<calendar_v3.Calendar | null> {
  const hotelId = getHotelId();
  const token = await getOAuthToken(hotelId, "google");
  if (!token) return null;

  const oauth2 = getOAuth2Client();
  oauth2.setCredentials({
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    expiry_date: new Date(token.expires_at).getTime(),
  });

  // Auto-refresh: when token is refreshed, save the new one
  oauth2.on("tokens", (newTokens) => {
    upsertOAuthToken(hotelId, {
      scope: token.scope,
      access_token: newTokens.access_token ?? token.access_token,
      refresh_token: newTokens.refresh_token ?? token.refresh_token,
      expires_at: newTokens.expiry_date
        ? new Date(newTokens.expiry_date).toISOString()
        : token.expires_at,
    });
  });

  return google.calendar({ version: "v3", auth: oauth2 });
}

/** Get the calendar ID from stored OAuth token. */
async function getCalendarId(): Promise<string> {
  const hotelId = getHotelId();
  const token = await getOAuthToken(hotelId, "google");
  return token?.calendar_id || "primary";
}

/** List all calendars the user has access to. */
export async function listCalendars(): Promise<
  { id: string; summary: string; primary: boolean }[]
> {
  const calendar = await getCalendarClient();
  if (!calendar) return [];

  const res = await calendar.calendarList.list();
  return (res.data.items ?? []).map((cal) => ({
    id: cal.id ?? "",
    summary: cal.summary ?? "Untitled",
    primary: cal.primary ?? false,
  }));
}

/**
 * Check if specific dates are available (not booked).
 * Returns an array of booked date strings (YYYY-MM-DD) within the range.
 */
export async function getBookedDates(
  startDate: string,
  endDate: string
): Promise<string[]> {
  const calendar = await getCalendarClient();
  if (!calendar) return [];

  const calendarId = await getCalendarId();

  const res = await calendar.freebusy.query({
    requestBody: {
      timeMin: `${startDate}T00:00:00Z`,
      timeMax: `${endDate}T23:59:59Z`,
      items: [{ id: calendarId }],
    },
  });

  const busyPeriods = res.data.calendars?.[calendarId]?.busy || [];
  const bookedDates = new Set<string>();

  for (const period of busyPeriods) {
    if (!period.start || !period.end) continue;
    const current = new Date(period.start);
    const end = new Date(period.end);

    while (current < end) {
      const y = current.getFullYear();
      const m = String(current.getMonth() + 1).padStart(2, "0");
      const d = String(current.getDate()).padStart(2, "0");
      bookedDates.add(`${y}-${m}-${d}`);
      current.setDate(current.getDate() + 1);
    }
  }

  return Array.from(bookedDates).sort();
}

/**
 * Check if a date range is fully available (no overlapping bookings).
 */
export async function isAvailable(
  checkIn: string,
  checkOut: string
): Promise<boolean> {
  const booked = await getBookedDates(checkIn, checkOut);
  return booked.length === 0;
}

/**
 * Create a calendar event for a booking.
 * Returns the event ID or null if calendar is not connected.
 */
export async function createBookingEvent(booking: {
  guest_name: string;
  phone: string;
  room_slug: string;
  rooms_count: number;
  check_in: string;
  check_out: string;
  total_price: number;
  booking_id: string;
}): Promise<string | null> {
  const calendar = await getCalendarClient();
  if (!calendar) return null;

  const hotel = getHotel();
  const calendarId = await getCalendarId();

  const res = await calendar.events.insert({
    calendarId,
    requestBody: {
      summary: `Booking #${booking.booking_id} — ${booking.guest_name}`,
      description: [
        `Guest: ${booking.guest_name}`,
        `Phone: ${booking.phone}`,
        `Room: ${booking.room_slug} (${booking.rooms_count} room${booking.rooms_count > 1 ? "s" : ""})`,
        `Total: ${hotel.currency} ${booking.total_price}`,
        `Booking ID: ${booking.booking_id}`,
      ].join("\n"),
      start: { date: booking.check_in },
      end: { date: booking.check_out },
      transparency: "opaque",
    },
  });

  return res.data.id ?? null;
}

/**
 * Update an existing calendar event (e.g., when dates change).
 */
export async function updateBookingEvent(
  eventId: string,
  updates: { check_in?: string; check_out?: string; guest_name?: string }
): Promise<void> {
  const calendar = await getCalendarClient();
  if (!calendar) return;

  const calendarId = await getCalendarId();
  const requestBody: calendar_v3.Schema$Event = {};

  if (updates.check_in) requestBody.start = { date: updates.check_in };
  if (updates.check_out) requestBody.end = { date: updates.check_out };
  if (updates.guest_name) requestBody.summary = updates.guest_name;

  await calendar.events.patch({
    calendarId,
    eventId,
    requestBody,
  });
}

/**
 * Delete a calendar event (e.g., when booking is cancelled).
 */
export async function deleteBookingEvent(eventId: string): Promise<void> {
  const calendar = await getCalendarClient();
  if (!calendar) return;

  const calendarId = await getCalendarId();

  await calendar.events.delete({
    calendarId,
    eventId,
  });
}

/** Generate the Google OAuth consent URL. */
export function getOAuthConsentUrl(): string {
  const oauth2 = getOAuth2Client();

  return oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/calendar.events",
    ],
  });
}

/** Exchange an authorization code for tokens and store them. */
export async function exchangeCodeForTokens(code: string): Promise<void> {
  const hotelId = getHotelId();
  const oauth2 = getOAuth2Client();
  const { tokens } = await oauth2.getToken(code);

  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error("Failed to get tokens from Google");
  }

  await upsertOAuthToken(hotelId, {
    scope: (tokens.scope ?? "").toString(),
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: tokens.expiry_date
      ? new Date(tokens.expiry_date).toISOString()
      : new Date(Date.now() + 3600 * 1000).toISOString(),
  });
}

/** Check if Google Calendar is connected (has valid OAuth tokens). */
export async function isCalendarConnected(): Promise<boolean> {
  const hotelId = getHotelId();
  const token = await getOAuthToken(hotelId, "google");
  return !!token;
}
