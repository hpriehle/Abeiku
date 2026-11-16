// Checks the sign-up forms. Pure; messages are plain short English for the owner.

import { parseRoomCount } from "./plans";

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function cleanEmail(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const e = v.trim().toLowerCase();
  return e.length <= 254 && EMAIL_RE.test(e) ? e : null;
}

export function parseAccount(body: Record<string, unknown>): Result<{ hotelName: string; email: string; password: string }> {
  const hotelName = typeof body.hotelName === "string" ? body.hotelName.trim() : "";
  if (hotelName.length < 2 || hotelName.length > 100) return { ok: false, error: "Enter your hotel's name." };
  const email = cleanEmail(body.email);
  if (!email) return { ok: false, error: "Enter a valid email address." };
  const password = typeof body.password === "string" ? body.password : "";
  if (password.length < 8) return { ok: false, error: "Use a password of at least 8 characters." };
  if (password.length > 200) return { ok: false, error: "That password is too long." };
  return { ok: true, value: { hotelName, email, password } };
}

export function parseHotelDetails(body: Record<string, unknown>): Result<{ town: string; rooms: number; contactEmail: string }> {
  const town = typeof body.town === "string" ? body.town.trim() : "";
  if (town.length < 2 || town.length > 80) return { ok: false, error: "Enter the town your hotel is in." };
  const rooms = parseRoomCount(body.rooms);
  if (rooms === null) return { ok: false, error: "Enter how many rooms you rent out (1 or more)." };
  const contactEmail = cleanEmail(body.contactEmail);
  if (!contactEmail) return { ok: false, error: "Enter a valid contact email." };
  return { ok: true, value: { town, rooms, contactEmail } };
}

export interface CalendarLinks {
  airbnb: string | null;
  booking: string | null;
  vrbo: string | null;
  google: string | null;
}

function icalUrl(v: unknown, label: string): Result<string | null> {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return { ok: true, value: null };
  let u: URL;
  try {
    u = new URL(s.replace(/^webcal:\/\//i, "https://"));
  } catch {
    return { ok: false, error: `The ${label} link is not a web address. Copy the full link that starts with https.` };
  }
  if (u.protocol !== "https:") return { ok: false, error: `The ${label} link must start with https.` };
  if (s.length > 1000) return { ok: false, error: `The ${label} link is too long.` };
  return { ok: true, value: u.toString() };
}

/** All optional. Google calendar ID looks like an email (abc@group.calendar.google.com). */
export function parseCalendarLinks(body: Record<string, unknown>): Result<CalendarLinks> {
  const out: Partial<CalendarLinks> = {};
  for (const [key, label] of [["airbnb", "Airbnb"], ["booking", "Booking.com"], ["vrbo", "VRBO"]] as const) {
    const r = icalUrl(body[key], label);
    if (!r.ok) return r;
    out[key] = r.value;
  }
  const g = typeof body.google === "string" ? body.google.trim() : "";
  if (g && (g.length > 254 || !EMAIL_RE.test(g))) {
    return { ok: false, error: "The Google calendar ID looks like an email address, for example abc123@group.calendar.google.com." };
  }
  out.google = g || null;
  return { ok: true, value: out as CalendarLinks };
}

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "hotel"
  );
}
