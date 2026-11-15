import { describe, expect, it } from "vitest";
import {
  computeCommission,
  currencyForCountry,
  defaultRule,
  displayCommission,
  displayStatus,
  formatMoney,
  isValidRefCode,
  totalsFor,
} from "./commission";

describe("formatMoney", () => {
  it("formats with currency", () => {
    expect(formatMoney(1050, "GHS")).toBe("GH₵ 1,050.00");
    expect(formatMoney(8.925, "USD")).toBe("$8.93");
    expect(formatMoney(0, "GHS")).toBe("GH₵ 0.00");
  });
  it("never prints NaN or null", () => {
    expect(formatMoney(NaN, "GHS")).toBe("—");
    expect(formatMoney(null, "USD")).toBe("—");
    expect(formatMoney(undefined, "GHS")).toBe("—");
  });
});

const booking = { nights: 3, room_total_usd: 600, total_ghs: 9000, ghs_per_usd: 15 };

describe("currency and defaults", () => {
  it("Ghana partners are GHS, everyone else USD", () => {
    expect(currencyForCountry("Ghana")).toBe("GHS");
    expect(currencyForCountry(" ghana ")).toBe("GHS");
    expect(currencyForCountry("United Kingdom")).toBe("USD");
  });

  it("defaults by type", () => {
    expect(defaultRule("agency", "GHS")).toEqual({ kind: "percent", value: 15, currency: "GHS" });
    expect(defaultRule("agency", "USD")).toEqual({ kind: "percent", value: 15, currency: "USD" });
    expect(defaultRule("local", "GHS")).toEqual({ kind: "per_night", value: 150, currency: "GHS" });
    expect(defaultRule("local", "USD")).toBeNull();
    expect(defaultRule("influencer", "GHS")).toBeNull();
  });
});

describe("computeCommission", () => {
  it("Ghana agency: 15% of total_ghs", () => {
    expect(computeCommission({ kind: "percent", value: 15, currency: "GHS" }, booking)).toBe(1350);
  });

  it("agency abroad: 15% of room_total_usd", () => {
    expect(computeCommission({ kind: "percent", value: 15, currency: "USD" }, booking)).toBe(90);
  });

  it("local: GH₵150 x nights", () => {
    expect(computeCommission({ kind: "per_night", value: 150, currency: "GHS" }, booking)).toBe(450);
  });

  it("converts with ghs_per_usd when the partner's total is missing", () => {
    const usdOnly = { nights: 2, room_total_usd: 200, total_ghs: null, ghs_per_usd: 15.5 };
    expect(computeCommission({ kind: "percent", value: 15, currency: "GHS" }, usdOnly)).toBe(465);
    const ghsOnly = { nights: 2, room_total_usd: null, total_ghs: 3000, ghs_per_usd: 15 };
    expect(computeCommission({ kind: "percent", value: 10, currency: "USD" }, ghsOnly)).toBe(20);
  });

  it("rounds to cents and returns 0 when no base is known", () => {
    const odd = { nights: 1, room_total_usd: 99.99, total_ghs: null, ghs_per_usd: null };
    expect(computeCommission({ kind: "percent", value: 15, currency: "USD" }, odd)).toBe(15);
    expect(
      computeCommission({ kind: "percent", value: 15, currency: "GHS" }, odd)
    ).toBe(0);
  });
});

describe("displayStatus", () => {
  const today = "2026-12-10";
  const base = { status: "paid" as const, check_out: "2026-12-10", payout_status: "unpaid" as const };

  it("pending until the check_out date has passed", () => {
    expect(displayStatus(base, today)).toBe("pending");
    expect(displayStatus({ ...base, check_out: "2026-12-20" }, today)).toBe("pending");
  });

  it("owed once check_out is in the past and unpaid", () => {
    expect(displayStatus({ ...base, check_out: "2026-12-09" }, today)).toBe("owed");
  });

  it("paid when payout is marked", () => {
    expect(displayStatus({ ...base, check_out: "2026-12-09", payout_status: "paid" }, today)).toBe("paid");
  });

  it("refunded / cancelled never owed and show 0 commission", () => {
    const r = { ...base, status: "refunded" as const, check_out: "2026-01-01", commission_amount: 100 };
    expect(displayStatus(r, today)).toBe("refunded");
    expect(displayCommission(r, today)).toBe(0);
    const c = { ...r, status: "cancelled" as const };
    expect(displayStatus(c, today)).toBe("cancelled");
    expect(displayCommission(c, today)).toBe(0);
  });

  it("totals by status", () => {
    const rows = [
      { ...base, check_out: "2026-12-20", commission_amount: 100 }, // pending
      { ...base, check_out: "2026-12-01", commission_amount: 50.5 }, // owed
      { ...base, check_out: "2026-12-02", commission_amount: 25 }, // owed
      { ...base, check_out: "2026-11-01", payout_status: "paid" as const, commission_amount: 10 },
      { ...base, status: "refunded" as const, check_out: "2026-11-01", commission_amount: 999 },
    ];
    expect(totalsFor(rows, today)).toEqual({ pending: 100, owed: 75.5, paid: 10 });
  });
});

describe("ref codes", () => {
  it("letters, digits, hyphen, case-insensitive", () => {
    expect(isValidRefCode("Kofi-Tours")).toBe(true);
    expect(isValidRefCode("ab")).toBe(true);
    expect(isValidRefCode("a")).toBe(false);
    expect(isValidRefCode("kofi tours")).toBe(false);
    expect(isValidRefCode("kofi_tours")).toBe(false);
  });
});
