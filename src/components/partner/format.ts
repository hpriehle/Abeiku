export { formatMoney } from "@/lib/partner/commission";

export const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-50 text-amber-900 border-amber-300",
  owed: "bg-blue-50 text-blue-900 border-blue-300",
  paid: "bg-green-50 text-green-900 border-green-300",
  refunded: "bg-gray-100 text-gray-700 border-gray-300",
  cancelled: "bg-gray-100 text-gray-700 border-gray-300",
};

export const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  owed: "Owed",
  paid: "Paid",
  refunded: "Refunded",
  cancelled: "Cancelled",
};

/** "14 Nov 2026"; "—" when there is no date or it cannot be read. */
export function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  const date = new Date(`${d.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** "1 night" / "3 nights" / "—". */
export function nightsLabel(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n} ${n === 1 ? "night" : "nights"}`;
}

export function ruleLabel(kind: string, value: number, currency: "GHS" | "USD"): string {
  if (!Number.isFinite(value)) return "—";
  if (kind === "percent") return `${value}% of room total`;
  return `${currency === "GHS" ? "GH₵ " : "$"}${value} per night`;
}
