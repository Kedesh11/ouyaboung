// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  payTransport: vi.fn(),
  syncPaymentTransactionStatus: vi.fn(),
  getFeeBreakdown: vi.fn(),
}));

vi.mock("@/services/transport-payment.service", () => ({ payTransport: mocks.payTransport }));
vi.mock("@/services/payment-transactions.service", () => ({ syncPaymentTransactionStatus: mocks.syncPaymentTransactionStatus }));
vi.mock("@/services/payment.service", () => ({ PAYMENT_FLOW_ENABLED: true }));
vi.mock("@/api/fees.api", () => ({ getFeeBreakdown: mocks.getFeeBreakdown }));
vi.mock("@/api/transport.api", () => ({
  cancelTransportRequest: vi.fn(),
  createTransportRequest: vi.fn(),
  getMyTransportRequest: vi.fn(),
  quoteTransport: vi.fn(),
}));

import { TransportPaymentSection } from "@/components/farmer/TransportPaymentSection";

const ok = (data: unknown) => ({ success: true, data, error: null });
const fail = (code: string, message = "boom") => ({ success: false, data: null, error: { code, message } });

// 118 700 fare: 10 % commission 11 870, PVIT 2.5 % of 130 570 = 3 265, Airtel 1 % = 1 306.
const breakdown = (over: Record<string, unknown> = {}) => ({
  flow: "transport",
  operator: "airtel",
  base_amount: 118700,
  recipient_amount: 118700,
  platform_fee: 11870,
  pvit_fee: 3265,
  operator_fee: 1306,
  total_amount: 135141,
  rates: { platform: 0.1, pvit: 0.025, operator: 0.01 },
  fees_estimated: true,
  currency: "XAF",
  ...over,
});

const request = (over: Record<string, unknown> = {}) =>
  ({
    id: "req-1",
    status: "accepted",
    fare_amount: 118700,
    payment_status: "unpaid",
    seconds_to_pay: 600,
    payment_reference: null,
    payment_breakdown: null,
    ...over,
  }) as never;

const renderSection = (req = request()) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TransportPaymentSection request={req} receivedAt={Date.now()} />
    </QueryClientProvider>,
  );
};

const payButton = async () => (await screen.findByRole("button", { name: /^Payer / })) as HTMLButtonElement;
const typePhone = (value: string) => fireEvent.change(screen.getByLabelText("Numéro Mobile Money"), { target: { value } });

describe("TransportPaymentSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getFeeBreakdown.mockResolvedValue(ok(breakdown()));
  });
  afterEach(cleanup);

  it("shows who takes what before paying: driver, platform, PVIT and the operator", async () => {
    renderSection();
    expect((await payButton()).textContent).toContain("135 141 FCFA");
    const card = screen.getByTestId("fee-breakdown");
    expect(screen.getByTestId("fee-base").textContent).toContain("118 700 FCFA");
    expect(screen.getByTestId("fee-base").textContent).toContain("le chauffeur");
    expect(screen.getByTestId("fee-platform").textContent).toContain("11 870 FCFA");
    expect(screen.getByTestId("fee-platform").textContent).toContain("10 %");
    expect(screen.getByTestId("fee-pvit").textContent).toContain("3 265 FCFA");
    expect(screen.getByTestId("fee-operator").textContent).toContain("Airtel Money");
    expect(screen.getByTestId("fee-operator").textContent).toContain("1 306 FCFA");
    expect(screen.getByTestId("fee-total").textContent).toContain("135 141 FCFA");
    expect(card.textContent).toContain("sans prélèvement");
    expect(card.textContent).toContain("estimation");
  });

  it("asks the server for the breakdown of the transport fare with the selected operator", async () => {
    renderSection();
    await payButton();
    expect(mocks.getFeeBreakdown).toHaveBeenCalledWith("transport", 118700, "airtel");
  });

  it("recalculates when the farmer switches to Moov (the operator fee follows its own rate)", async () => {
    mocks.getFeeBreakdown.mockImplementation(async (_flow: string, _base: number, operator: string) =>
      ok(breakdown(operator === "moov" ? { operator: "moov", operator_fee: 1959, total_amount: 135794, rates: { platform: 0.1, pvit: 0.025, operator: 0.015 } } : {})),
    );
    renderSection();
    await payButton();
    fireEvent.click(screen.getByRole("button", { name: "Moov Money" }));
    await waitFor(() => expect(screen.getByTestId("fee-operator").textContent).toContain("Moov Money"));
    expect(screen.getByTestId("fee-operator").textContent).toContain("1,5 %");
    expect((await payButton()).textContent).toContain("135 794 FCFA");
  });

  it("shows the payment countdown", async () => {
    renderSection();
    await payButton();
    expect(screen.getByRole("timer").textContent).toMatch(/9 min 5\d s|10 min 00 s/);
  });

  it("never starts a payment on its own: nothing is sent before the click", async () => {
    renderSection();
    await payButton();
    expect(mocks.payTransport).not.toHaveBeenCalled();
  });

  it("cannot pay without a phone number", async () => {
    renderSection();
    const button = await payButton();
    expect(button.disabled).toBe(true);
    typePhone("0771");
    expect(button.disabled).toBe(true);
    typePhone("077123456");
    expect(button.disabled).toBe(false);
  });

  it("cannot pay while the total is unknown, and says why", async () => {
    mocks.getFeeBreakdown.mockResolvedValue(fail("NETWORK_ERROR"));
    renderSection();
    expect(await screen.findByText(/Impossible de calculer les frais/, {}, { timeout: 4000 })).toBeTruthy();
    typePhone("077123456");
    expect((screen.getByRole("button", { name: "Calcul du total…" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("sends only the course id, the number and the operator (never an amount)", async () => {
    mocks.payTransport.mockResolvedValue(ok({ reference: "OYB1" }));
    renderSection();
    await payButton();
    fireEvent.click(screen.getByRole("button", { name: "Moov Money" }));
    typePhone("062123456");
    fireEvent.click(await payButton());
    await waitFor(() => expect(mocks.payTransport).toHaveBeenCalledTimes(1));
    expect(mocks.payTransport).toHaveBeenCalledWith({ requestId: "req-1", phone: "062123456", operator: "moov" });
  });

  it("explains a refusal from the server", async () => {
    mocks.payTransport.mockResolvedValue(fail("PAYMENT_WINDOW_EXPIRED"));
    renderSection();
    typePhone("077123456");
    fireEvent.click(await payButton());
    expect(await screen.findByText(/délai de paiement est dépassé/)).toBeTruthy();
  });

  it("blocks payment once the window is over", async () => {
    renderSection(request({ seconds_to_pay: 0 }));
    const button = await payButton();
    expect(screen.getByText("Délai dépassé")).toBeTruthy();
    typePhone("077123456");
    expect(button.disabled).toBe(true);
  });

  it("asks the farmer to confirm on the phone while the payment is pending, with a manual check", async () => {
    mocks.syncPaymentTransactionStatus.mockResolvedValue(ok({}));
    renderSection(request({ payment_status: "pending", payment_reference: "OYBREF", payment_breakdown: breakdown() }));
    expect(screen.getByText("Validez le paiement sur votre téléphone")).toBeTruthy();
    expect(screen.getByTestId("transport-payment-pending").textContent).toContain("135 141 FCFA");
    expect(screen.queryByRole("button", { name: /^Payer / })).toBeNull();
    expect(mocks.getFeeBreakdown).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Vérifier le paiement" }));
    await waitFor(() => expect(mocks.syncPaymentTransactionStatus).toHaveBeenCalledWith({ reference: "OYBREF" }));
  });

  it("keeps the detail of what was paid once the course is paid", async () => {
    renderSection(request({ payment_status: "paid", payment_breakdown: breakdown() }));
    expect(screen.getByTestId("transport-paid").textContent).toContain("Course payée");
    expect(screen.getByTestId("transport-paid").textContent).toContain("135 141 FCFA");
    expect(screen.getByTestId("fee-total").textContent).toContain("Total payé");
    expect(screen.getByTestId("fee-platform").textContent).toContain("11 870 FCFA");
    expect(screen.queryByTestId("transport-payment-form")).toBeNull();
    expect(mocks.getFeeBreakdown).not.toHaveBeenCalled();
  });

  it("renders nothing for a course that does not await payment", () => {
    const { container } = renderSection(request({ status: "proposed" }));
    expect(container.textContent).toBe("");
  });
});
