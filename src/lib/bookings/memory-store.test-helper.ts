// In-memory HotelBookingsStore for tests (enforces the (hotel, source, external_ref) key).

import type { HotelBookingRow, HotelBookingsStore } from "./hotel-bookings";

export function memoryHotelBookings(initial: HotelBookingRow[] = []) {
  const rows = new Map<string, HotelBookingRow>(initial.map((r) => [r.id, { ...r }]));
  let seq = 0;
  let writes = 0;
  const store: HotelBookingsStore = {
    async find(hotelId, source, ref) {
      const r = [...rows.values()].find((x) => x.hotel_id === hotelId && x.source === source && x.external_ref === ref);
      return r ? { ...r } : null;
    },
    async listBySources(hotelId, sources) {
      return [...rows.values()].filter((r) => r.hotel_id === hotelId && sources.includes(r.source)).map((r) => ({ ...r }));
    },
    async insert(row) {
      const clash = [...rows.values()].some(
        (x) => x.hotel_id === row.hotel_id && x.source === row.source && x.external_ref === row.external_ref
      );
      if (clash) return null;
      writes++;
      const saved = { ...row, id: `hb${++seq}` };
      rows.set(saved.id, saved);
      return { ...saved };
    },
    async update(id, patch) {
      writes++;
      rows.set(id, { ...rows.get(id)!, ...patch });
    },
  };
  return { store, rows, all: () => [...rows.values()], writes: () => writes };
}
