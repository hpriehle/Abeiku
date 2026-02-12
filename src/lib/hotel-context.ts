import { AsyncLocalStorage } from "node:async_hooks";
import { Hotel } from "./db";

export interface HotelContext {
  hotelId: string;
  hotel: Hotel;
}

export const hotelStorage = new AsyncLocalStorage<HotelContext>();

export function getHotelContext(): HotelContext {
  const ctx = hotelStorage.getStore();
  if (!ctx) {
    throw new Error("Hotel context not set. This code must run inside hotelStorage.run().");
  }
  return ctx;
}

export function getHotelId(): string {
  return getHotelContext().hotelId;
}

export function getHotel(): Hotel {
  return getHotelContext().hotel;
}
