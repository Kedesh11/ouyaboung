/**
 * The edge tests use a TypeScript mirror of the SQL compute_fee_breakdown(). These worked examples
 * are the same ones the SQL tests assert against a real Postgres, so the mirror cannot drift.
 */
import { describe, expect, it } from "vitest";
import { computeFeeBreakdownFake, DEFAULT_FEE_RATES } from "./helpers/supabase-edge-fake";

const b = (flow: string, base: number, operator: string, rates = DEFAULT_FEE_RATES) =>
  computeFeeBreakdownFake(rates, flow, base, operator) as Record<string, any>;

describe("fee breakdown mirror (same examples as the SQL tests)", () => {
  it("order 10000 via Airtel: 1000 + 275 + 110 = 11385", () => {
    expect(b("order", 10000, "airtel")).toMatchObject({ platform_fee: 1000, pvit_fee: 275, operator_fee: 110, total_amount: 11385, recipient_amount: 10000 });
  });

  it("rounds PVIT and operator fees up: 101 -> 10 + 3 + 2 = 116", () => {
    expect(b("order", 101, "airtel").total_amount).toBe(116);
  });

  it("applies the order rate, the PVIT rate and the operator rate of the new settings (12 % / 3 %)", () => {
    const rates = { ...DEFAULT_FEE_RATES, order: 0.12, pvit: 0.03 };
    expect(b("order", 10000, "airtel", rates)).toMatchObject({ platform_fee: 1200, pvit_fee: 336, operator_fee: 112 });
  });

  it("uses the transport commission and the Moov rate for a Moov transport payer", () => {
    const rates = { ...DEFAULT_FEE_RATES, transport: 0.08, pvit: 0.03, moov: 0.015 };
    expect(b("transport", 10000, "moov", rates)).toMatchObject({ platform_fee: 800, operator_fee: 162 });
    expect(b("transport", 10000, "airtel", rates).operator_fee).toBe(108);
  });

  it("always adds up and always pays the recipient in full", () => {
    for (let base = 1; base <= 3000; base += 7) {
      const r = b("order", base, "airtel");
      expect(r.total_amount).toBe(r.base_amount + r.platform_fee + r.pvit_fee + r.operator_fee);
      expect(r.recipient_amount).toBe(base);
    }
  });

  it("refuses an invalid flow, operator or amount", () => {
    expect(b("x", 1000, "airtel").code).toBe("INVALID_FLOW");
    expect(b("order", 1000, "orange").code).toBe("INVALID_OPERATOR");
    for (const bad of [0, -5, 1.5, 2_000_000_000]) expect(b("order", bad, "airtel").code).toBe("INVALID_AMOUNT");
  });
});
