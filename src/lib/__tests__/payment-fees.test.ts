import { calculatePaymentFees, getFeeRates } from "@/lib/payment-fees";

describe("payment-fees", () => {
  it("calculates fees correctly for integer amount", () => {
    const fees = calculatePaymentFees(1000);
    expect(fees.baseAmount).toBe(1000);
    expect(fees.airtelFees).toBe(0);
    expect(fees.pvitFees).toBe(0);
    expect(fees.appFees).toBe(0);
    expect(fees.totalFees).toBe(0);
    expect(fees.finalAmount).toBe(1000);
  });

  it("rounds each fee component", () => {
    const fees = calculatePaymentFees(999);
    expect(fees.airtelFees).toBe(0);
    expect(fees.totalFees).toBe(fees.airtelFees + fees.pvitFees + fees.appFees);
  });

  it("throws on invalid amount", () => {
    expect(() => calculatePaymentFees(0)).toThrow();
    expect(() => calculatePaymentFees(-10)).toThrow();
    expect(() => calculatePaymentFees(12.5)).toThrow();
  });

  it("returns fee rates for display", () => {
    const rates = getFeeRates();
    expect(rates).toEqual({
      airtel: 0,
      pvit: 0,
      app: 0,
      total: 0,
    });
  });
});
