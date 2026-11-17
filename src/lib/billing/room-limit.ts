// The plan's room limit, checked when rooms are created or changed (Rooms page).
//
// Counting: a standard room counts its units (total_rooms); an individual room counts 1;
// a group ("entire house") listing counts 0 when it has member rooms (they are counted
// themselves), else its own units. Only active rooms count (getHotelRooms returns those).
//
// Not blocked: billing-exempt hotels, hotels with no billing record (legacy), the slugs below,
// and the large plan (no upper limit). A save that does not raise the count is never refused,
// so a hotel already over the limit can still edit its rooms.

import { billingView, type HotelBilling } from "./access";
import { SMALL_MAX_ROOMS, tierForRooms } from "./plans";
import { isMissingColumnError } from "./store";

export const ROOM_LIMIT_EXEMPT_SLUGS = new Set(["aracuya", "test-hotel"]);

export interface RoomUnits {
  id: string;
  room_type?: string | null;
  total_rooms?: number | null;
  group_id?: string | null;
}

export function countRoomUnits(rooms: RoomUnits[]): number {
  const groupsWithMembers = new Set(rooms.filter((r) => r.room_type === "individual" && r.group_id).map((r) => r.group_id));
  let n = 0;
  for (const r of rooms) {
    if (r.room_type === "individual") n += 1;
    else if (r.room_type === "group" && groupsWithMembers.has(r.id)) n += 0;
    else n += Math.max(1, Math.floor(Number(r.total_rooms) || 1));
  }
  return n;
}

/** The plan's room limit, or null when there is none to enforce. */
export function planRoomLimit(hotel: (HotelBilling & { slug?: string | null }) | null): number | null {
  if (!hotel) return null;
  if (hotel.slug && ROOM_LIMIT_EXEMPT_SLUGS.has(hotel.slug)) return null;
  const v = billingView(hotel);
  if (v.exempt || v.legacy) return null;
  const tier = v.tier ?? (v.roomCount ? tierForRooms(v.roomCount) : null);
  return tier === "small" ? SMALL_MAX_ROOMS : null;
}

/** Part of the refusal text; the Rooms form shows a Plan page link when it sees it. */
export const ROOM_LIMIT_HINT = "Upgrade your plan on the Plan page";

export function roomLimitMessage(limit: number): string {
  return `Your plan covers up to ${limit} rooms. ${ROOM_LIMIT_HINT} to add more.`;
}

export type RoomLimitCheck = { ok: true } | { ok: false; limit: number; count: number; error: string };

/** Refuse a save that takes the hotel from `before` to `after` rooms over its plan's limit. */
export function checkRoomLimit(limit: number | null, before: RoomUnits[], after: RoomUnits[]): RoomLimitCheck {
  if (limit === null) return { ok: true };
  const count = countRoomUnits(after);
  if (count <= limit || count <= countRoomUnits(before)) return { ok: true };
  return { ok: false, limit, count, error: roomLimitMessage(limit) };
}

/** The current rooms with one room added or changed. */
export function roomsAfterSave(rooms: RoomUnits[], saved: RoomUnits): RoomUnits[] {
  const i = rooms.findIndex((r) => r.id === saved.id);
  if (i < 0) return [...rooms, saved];
  const copy = rooms.slice();
  copy[i] = { ...rooms[i], ...Object.fromEntries(Object.entries(saved).filter(([, v]) => v !== undefined)) };
  return copy;
}

/** The hotel's limit from the database; null (no block) when billing can't be read. */
export async function loadRoomLimit(
  hotelId: string,
  getHotel: (id: string) => Promise<(HotelBilling & { slug?: string | null }) | null>
): Promise<number | null> {
  try {
    return planRoomLimit(await getHotel(hotelId));
  } catch (err) {
    if (!isMissingColumnError(err)) console.error("[billing] room limit read failed, not blocking:", err);
    return null;
  }
}

/** JSON body for a refused save: the message and where to upgrade. */
export function roomLimitResponseBody(check: Extract<RoomLimitCheck, { ok: false }>) {
  return { error: check.error, code: "room_limit", limit: check.limit, upgradeUrl: "/admin/plan" };
}
