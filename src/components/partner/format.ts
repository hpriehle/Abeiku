export { formatMoney } from "@/lib/partner/commission";

export const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-50 text-amber-800 border-amber-200",
  owed: "bg-blue-50 text-blue-800 border-blue-200",
  paid: "bg-green-50 text-green-800 border-green-200",
  refunded: "bg-gray-100 text-gray-600 border-gray-200",
  cancelled: "bg-gray-100 text-gray-600 border-gray-200",
};

export function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(`${d.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function ruleLabel(kind: string, value: number, currency: "GHS" | "USD"): string {
  if (kind === "percent") return `${value}% of room total`;
  return `${currency === "GHS" ? "GH₵" : "$"}${value} per night`;
}
