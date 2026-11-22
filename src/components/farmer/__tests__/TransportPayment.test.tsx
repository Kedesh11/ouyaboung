// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  payTransport: vi.fn(),
  syncPaymentTransactionStatus: vi.fn(),
}));

vi.mock("@/services/transport-payment.service", () => ({ payTransport: mocks.payTransport }));
vi.mock("@/services/payment-transactions.service", () => ({ syncPaymentTransactionStatus: mocks.syncPaymentTransactionStatus }));
vi.mock("@/services/payment.service", () => ({ PAYMENT_FLOW_ENABLED: true }));
vi.mock("@/api/transport.api", () => ({
  cancelTransportRequest: vi.fn(),
  createTransportRequest: vi.fn(),
  getMyTransportRequest: vi.fn(),
  quoteTransport: vi.fn(),
}));

import { TransportPaymentSection } from "@/components/farmer/TransportPaymentSection";

const ok = (data: unknown) => ({ success: true, data, error: null });
const fail = (code: string, message = "boom") => ({ success: false, data: null, error: { code, message } });

const request = (over: Record<string, unknown> = {}) =>
  ({
    id: "req-1",
    status: "accepted",
    fare_amount: 118700,
    payment_status: "unpaid",
    seconds_to_pay: 600,
    payment_reference: null,
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

const submit = () => screen.getByRole("button", { name: /^Payer / }) as HTMLButtonElement;
const typePhone = (value: string) => fireEvent.change(screen.getByLabelText("Numéro Mobile Money"), { target: { value } });

describe("TransportPaymentSection", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it("shows the frozen fare and the payment countdown", () => {
    renderSection();
    expect(submit().textContent).toContain("118 700 FCFA");
    expect(screen.getByRole("timer").textContent).toMatch(/9 min 5\d s|10 min 00 s/);
  });

  it("never starts a payment on its own: nothing is sent before the click", () => {
    renderSection();
    expect(mocks.payTransport).not.toHaveBeenCalled();
  });

  it("cannot pay without a phone number", () => {
    renderSection();
    expect(submit().disabled).toBe(true);
    typePhone("0771");
    expect(submit().disabled).toBe(true);
    typePhone("077123456");
    expect(submit().disabled).toBe(false);
  });

  it("sends only the course id, the number and the operator", async () => {
    mocks.payTransport.mockResolvedValue(ok({ reference: "OYB1" }));
    renderSection();
    fireEvent.click(screen.getByRole("button", { name: "Moov Money" }));
    typePhone("062123456");
    fireEvent.click(submit());
    await waitFor(() => expect(mocks.payTransport).toHaveBeenCalledTimes(1));
    expect(mocks.payTransport).toHaveBeenCalledWith({ requestId: "req-1", phone: "062123456", operator: "moov" });
  });

  it("explains a refusal from the server", async () => {
    mocks.payTransport.mockResolvedValue(fail("PAYMENT_WINDOW_EXPIRED"));
    renderSection();
    typePhone("077123456");
    fireEvent.click(submit());
    expect(await screen.findByText(/délai de paiement est dépassé/)).toBeTruthy();
  });

  it("blocks payment once the window is over", () => {
    renderSection(request({ seconds_to_pay: 0 }));
    expect(screen.getByText("Délai dépassé")).toBeTruthy();
    typePhone("077123456");
    expect(submit().disabled).toBe(true);
  });

  it("asks the farmer to confirm on the phone while the payment is pending, with a manual check", async () => {
    mocks.syncPaymentTransactionStatus.mockResolvedValue(ok({}));
    renderSection(request({ payment_status: "pending", payment_reference: "OYBREF" }));
    expect(screen.getByText("Validez le paiement sur votre téléphone")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Payer / })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Vérifier le paiement" }));
    await waitFor(() => expect(mocks.syncPaymentTransactionStatus).toHaveBeenCalledWith({ reference: "OYBREF" }));
  });

  it("says the course is paid once confirmed", () => {
    renderSection(request({ payment_status: "paid" }));
    expect(screen.getByTestId("transport-paid").textContent).toContain("Course payée");
    expect(screen.queryByTestId("transport-payment-form")).toBeNull();
  });

  it("renders nothing for a course that does not await payment", () => {
    const { container } = renderSection(request({ status: "proposed" }));
    expect(container.textContent).toBe("");
  });
});
