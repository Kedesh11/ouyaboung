import { describe, expect, it } from "vitest";
import { formatPercent, formatXaf, operatorLabel, previewFeeBreakdown } from "@/lib/fees";
import type { FeeSettingsInput } from "@/api/fees.api";

const rates: FeeSettingsInput = {
  order_commission_rate: 0.1,
  transport_commission_rate: 0.1,
  pvit_fee_rate: 0.025,
  airtel_fee_rate: 0.01,
  moov_fee_rate: 0.01,
};

describe("fee display helpers", () => {
  it("formats percentages the French way", () => {
    expect(formatPercent(0.1)).toBe("10 %");
    expect(formatPercent(0.025)).toBe("2,5 %");
    expect(formatPercent(0.0125)).toBe("1,25 %");
    expect(formatPercent(0)).toBe("0 %");
  });

  it("formats amounts in FCFA with spaces", () => {
    expect(formatXaf(11385)).toBe("11 385 FCFA");
    expect(formatXaf(850)).toBe("850 FCFA");
    expect(formatXaf(null)).toBe("—");
  });

  it("names the operators", () => {
    expect(operatorLabel("airtel")).toBe("Airtel Money");
    expect(operatorLabel("moov")).toBe("Moov Money");
  });
});

// Same worked examples as the SQL tests: this preview must always agree with compute_fee_breakdown().
describe("previewFeeBreakdown (mirror of the SQL calculation)", () => {
  it("order 10000 via Airtel: 1000 + 275 + 110 = 11385", () => {
    expect(previewFeeBreakdown(rates, "order", 10000, "airtel")).toEqual({ base: 10000, platform: 1000, pvit: 275, operator: 110, total: 11385 });
  });

  it("rounds PVIT and operator fees up: 101 -> 10 + 3 + 2 = 116", () => {
    expect(previewFeeBreakdown(rates, "order", 101, "airtel").total).toBe(116);
  });

  it("follows new rates (order 12 %, PVIT 3 %): 1200 + 336 + 112", () => {
    const next = { ...rates, order_commission_rate: 0.12, pvit_fee_rate: 0.03 };
    expect(previewFeeBreakdown(next, "order", 10000, "airtel")).toMatchObject({ platform: 1200, pvit: 336, operator: 112 });
  });

  it("uses the transport commission and the Moov rate", () => {
    const next = { ...rates, transport_commission_rate: 0.08, pvit_fee_rate: 0.03, moov_fee_rate: 0.015 };
    expect(previewFeeBreakdown(next, "transport", 10000, "moov")).toMatchObject({ platform: 800, operator: 162 });
    expect(previewFeeBreakdown(next, "transport", 10000, "airtel").operator).toBe(108);
    // The transport commission does not touch an order.
    expect(previewFeeBreakdown(next, "order", 10000, "airtel").platform).toBe(1000);
  });

  it("always adds up exactly", () => {
    for (let base = 1; base <= 4000; base += 3) {
      const r = previewFeeBreakdown(rates, "transport", base, "moov");
      expect(r.total).toBe(base + r.platform + r.pvit + r.operator);
    }
  });
});

import { transactionBreakdown } from "@/lib/fees";

describe("transactionBreakdown (history of what the customer paid)", () => {
  it("prefers the breakdown frozen at payment time", () => {
    const frozen = { flow: "order", operator: "moov", base_amount: 5000, recipient_amount: 5000, platform_fee: 500, pvit_fee: 138, operator_fee: 55, total_amount: 5693, rates: { platform: 0.1, pvit: 0.025, operator: 0.01 }, fees_estimated: true, currency: "XAF" } as const;
    expect(transactionBreakdown({ fee_breakdown: frozen as never, total_amount: 1 })).toBe(frozen);
  });

  it("rebuilds it from the transaction columns for older payments (no rates)", () => {
    const rebuilt = transactionBreakdown({ operator: "AIRTEL_MONEY", base_amount: 10000, app_fees: 1000, pvit_fees: 275, airtel_fees: 110, total_amount: 11385 });
    expect(rebuilt).toMatchObject({ operator: "airtel", base_amount: 10000, recipient_amount: 10000, platform_fee: 1000, pvit_fee: 275, operator_fee: 110, total_amount: 11385 });
    expect(rebuilt?.rates).toBeUndefined();
  });

  it("recognizes a Moov payer", () => {
    expect(transactionBreakdown({ operator: "MOOV_MONEY", base_amount: 100, total_amount: 100 })?.operator).toBe("moov");
  });

  it("treats missing fees as zero (payments made before the fees existed)", () => {
    expect(transactionBreakdown({ base_amount: 5000, total_amount: 5000 })).toMatchObject({ platform_fee: 0, pvit_fee: 0, operator_fee: 0, total_amount: 5000 });
  });

  it("returns null when nothing usable is known", () => {
    expect(transactionBreakdown({})).toBeNull();
    expect(transactionBreakdown({ base_amount: 100, total_amount: 0 })).toBeNull();
  });
});
