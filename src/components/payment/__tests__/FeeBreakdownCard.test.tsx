// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getFeeBreakdown: vi.fn() }));
vi.mock("@/api/fees.api", () => ({ getFeeBreakdown: mocks.getFeeBreakdown }));

import { FeeBreakdownCard, FeeBreakdownLive } from "@/components/payment/FeeBreakdownCard";

const breakdown = (over: Record<string, unknown> = {}) => ({
  flow: "order",
  operator: "airtel",
  base_amount: 10000,
  recipient_amount: 10000,
  platform_fee: 1000,
  pvit_fee: 275,
  operator_fee: 110,
  total_amount: 11385,
  rates: { platform: 0.1, pvit: 0.025, operator: 0.01 },
  fees_estimated: true,
  currency: "XAF",
  ...over,
});

describe("FeeBreakdownCard", () => {
  afterEach(cleanup);

  it("lists every party that takes a share, with its rate", () => {
    render(<FeeBreakdownCard breakdown={breakdown() as never} recipientLabel="Boulangerie Ndong" />);
    expect(screen.getByTestId("fee-base").textContent).toContain("Boulangerie Ndong");
    expect(screen.getByTestId("fee-base").textContent).toContain("10 000 FCFA");
    expect(screen.getByTestId("fee-platform").textContent).toMatch(/Commission Ouyaboung.*10 %.*1 000 FCFA/);
    expect(screen.getByTestId("fee-pvit").textContent).toMatch(/Frais PVIT.*2,5 %.*275 FCFA/);
    expect(screen.getByTestId("fee-operator").textContent).toMatch(/Frais Airtel Money.*1 %.*110 FCFA/);
    expect(screen.getByTestId("fee-total").textContent).toContain("Total à payer");
    expect(screen.getByTestId("fee-total").textContent).toContain("11 385 FCFA");
  });

  it("states that the recipient is paid in full and that the commission is on the customer", () => {
    render(<FeeBreakdownCard breakdown={breakdown() as never} recipientLabel="le chauffeur" />);
    expect(screen.getByTestId("fee-base").textContent).toContain("intégralité, sans prélèvement");
    expect(screen.getByTestId("fee-platform").textContent).toContain("payée par vous");
  });

  it("names Moov for a Moov payer", () => {
    render(<FeeBreakdownCard breakdown={breakdown({ operator: "moov", rates: { platform: 0.1, pvit: 0.025, operator: 0.015 } }) as never} recipientLabel="x" />);
    expect(screen.getByTestId("fee-operator").textContent).toMatch(/Moov Money.*1,5 %/);
  });

  it("warns that PVIT and operator fees are estimates and that rates can change", () => {
    render(<FeeBreakdownCard breakdown={breakdown() as never} recipientLabel="x" />);
    expect(screen.getByTestId("fee-breakdown").textContent).toContain("estimation");
    expect(screen.getByTestId("fee-breakdown").textContent).toContain("vous en êtes informé");
  });

  it("switches wording once settled (history)", () => {
    render(<FeeBreakdownCard breakdown={breakdown() as never} recipientLabel="x" settled title="Détail de ce que vous avez payé" />);
    expect(screen.getByText("Détail de ce que vous avez payé")).toBeTruthy();
    expect(screen.getByTestId("fee-total").textContent).toContain("Total payé");
    expect(screen.getByTestId("fee-breakdown").textContent).toContain("au moment du paiement");
  });

  it("shows a loading state, then an error without inventing any number", () => {
    const { rerender } = render(<FeeBreakdownCard breakdown={null} recipientLabel="x" loading />);
    expect(screen.getByRole("status").textContent).toContain("Calcul des frais");
    rerender(<FeeBreakdownCard breakdown={null} recipientLabel="x" error="Impossible" />);
    expect(screen.getByRole("alert").textContent).toContain("Impossible");
    expect(screen.queryByTestId("fee-total")).toBeNull();
  });

  it("keeps the last known breakdown when a refresh fails", () => {
    render(<FeeBreakdownCard breakdown={breakdown() as never} recipientLabel="x" error="Impossible" />);
    expect(screen.getByTestId("fee-total").textContent).toContain("11 385 FCFA");
  });
});

describe("FeeBreakdownLive", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  const renderLive = (props: Partial<React.ComponentProps<typeof FeeBreakdownLive>> = {}) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={client}>
        <FeeBreakdownLive flow="order" baseAmount={10000} operator="airtel" recipientLabel="le marchand" {...props} />
      </QueryClientProvider>,
    );
  };

  it("fetches the server's calculation and displays it", async () => {
    mocks.getFeeBreakdown.mockResolvedValue({ success: true, data: breakdown(), error: null });
    renderLive();
    expect((await screen.findByTestId("fee-total")).textContent).toContain("11 385 FCFA");
    expect(mocks.getFeeBreakdown).toHaveBeenCalledWith("order", 10000, "airtel");
  });

  it("does not call the server for an invalid amount", () => {
    renderLive({ baseAmount: 0 });
    expect(mocks.getFeeBreakdown).not.toHaveBeenCalled();
  });

  it("reports a failure to the customer", async () => {
    mocks.getFeeBreakdown.mockResolvedValue({ success: false, data: null, error: { code: "NETWORK_ERROR", message: "x" } });
    renderLive();
    expect(await screen.findByRole("alert", {}, { timeout: 4000 })).toBeTruthy();
  });
});
