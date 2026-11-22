// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getFeeBreakdown: vi.fn(),
  initiateAirtelPayment: vi.fn(),
  initiateMoovPayment: vi.fn(),
  flowEnabled: { value: true },
}));

vi.mock("@/api/fees.api", () => ({ getFeeBreakdown: mocks.getFeeBreakdown }));
vi.mock("@/services/payment.service", () => ({
  initiateAirtelPayment: mocks.initiateAirtelPayment,
  initiateMoovPayment: mocks.initiateMoovPayment,
  get PAYMENT_FLOW_ENABLED() {
    return mocks.flowEnabled.value;
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import PaymentModal from "@/components/payment/PaymentModal";

const ok = (data: unknown) => ({ success: true, data, error: null });

const breakdown = (operator: string, over: Record<string, unknown> = {}) => ({
  flow: "order",
  operator,
  base_amount: 5000,
  recipient_amount: 5000,
  platform_fee: 500,
  pvit_fee: 138,
  operator_fee: operator === "airtel" ? 55 : 83,
  total_amount: operator === "airtel" ? 5693 : 5721,
  rates: { platform: 0.1, pvit: 0.025, operator: operator === "airtel" ? 0.01 : 0.015 },
  fees_estimated: true,
  currency: "XAF",
  ...over,
});

const renderModal = (props: Partial<React.ComponentProps<typeof PaymentModal>> = {}) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PaymentModal isOpen onClose={vi.fn()} amount={5000} orderId="order-1" onSuccess={vi.fn()} merchant={{ name: "Boulangerie Ndong" }} {...props} />
    </QueryClientProvider>,
  );
};

describe("PaymentModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.flowEnabled.value = true;
    mocks.getFeeBreakdown.mockImplementation(async (_flow: string, _base: number, operator: string) => ok(breakdown(operator)));
  });
  afterEach(cleanup);

  it("shows the consumer who takes what: shop (full price), platform, PVIT and the operator", async () => {
    renderModal();
    expect((await screen.findByTestId("fee-total")).textContent).toContain("5 693 FCFA");
    expect(screen.getByTestId("fee-base").textContent).toContain("Boulangerie Ndong");
    expect(screen.getByTestId("fee-base").textContent).toContain("5 000 FCFA");
    expect(screen.getByTestId("fee-platform").textContent).toContain("500 FCFA");
    expect(screen.getByTestId("fee-pvit").textContent).toContain("138 FCFA");
    expect(screen.getByTestId("fee-operator").textContent).toMatch(/Airtel Money.*55 FCFA/);
  });

  it("asks the server for the order flow with the order price", async () => {
    renderModal();
    await screen.findByTestId("fee-total");
    expect(mocks.getFeeBreakdown).toHaveBeenCalledWith("order", 5000, "airtel");
  });

  it("labels the pay button with the total, and keeps it disabled until the total is known", async () => {
    renderModal();
    const early = screen.getByRole("button", { name: "Calcul du total…" }) as HTMLButtonElement;
    expect(early.disabled).toBe(true);
    expect((await screen.findByRole("button", { name: "Payer 5 693 FCFA" })) as HTMLButtonElement).toBeTruthy();
  });

  it("recalculates with the other operator's rate when the consumer switches to Moov", async () => {
    renderModal();
    await screen.findByTestId("fee-total");
    fireEvent.click(screen.getByRole("button", { name: /Libertis\/Moov/ }));
    await waitFor(() => expect(screen.getByTestId("fee-total").textContent).toContain("5 721 FCFA"));
    expect(screen.getByTestId("fee-operator").textContent).toMatch(/Moov Money.*1,5 %/);
    expect(await screen.findByRole("button", { name: "Payer 5 721 FCFA" })).toBeTruthy();
  });

  it("sends the order price (never the total or the fees) to the payment service", async () => {
    mocks.initiateAirtelPayment.mockResolvedValue(ok({ message: "ok", transactionId: "t1" }));
    renderModal();
    fireEvent.change(screen.getByLabelText(/Numéro Airtel/), { target: { value: "077123456" } });
    fireEvent.click(await screen.findByRole("button", { name: "Payer 5 693 FCFA" }));
    await waitFor(() => expect(mocks.initiateAirtelPayment).toHaveBeenCalledTimes(1));
    expect(mocks.initiateAirtelPayment).toHaveBeenCalledWith({ baseAmount: 5000, phone: "077123456", orderId: "order-1" });
  });

  it("does not compute any fee while the payment is unavailable", () => {
    mocks.flowEnabled.value = false;
    renderModal();
    expect(screen.getByText("Paiement indisponible")).toBeTruthy();
    expect(mocks.getFeeBreakdown).not.toHaveBeenCalled();
  });

  it("explains a fee calculation failure without showing an invented total", async () => {
    mocks.getFeeBreakdown.mockResolvedValue({ success: false, data: null, error: { code: "NETWORK_ERROR", message: "x" } });
    renderModal();
    expect(await screen.findByRole("alert", {}, { timeout: 4000 })).toBeTruthy();
    expect(screen.queryByTestId("fee-total")).toBeNull();
    expect((screen.getByRole("button", { name: "Calcul du total…" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
