// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDriverPayoutAccounts: vi.fn(),
  createDriverPayoutAccount: vi.fn(),
  verifyDriverPayoutAccount: vi.fn(),
}));

vi.mock("@/services/payout.service", () => ({
  getDriverPayoutAccounts: mocks.getDriverPayoutAccounts,
  createDriverPayoutAccount: mocks.createDriverPayoutAccount,
  verifyDriverPayoutAccount: mocks.verifyDriverPayoutAccount,
}));

import { DriverPayoutAccounts, DriverPayoutNotice } from "@/components/driver/DriverPayoutAccounts";

const wrap = (ui: React.ReactElement) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
};

const ok = (data: unknown) => ({ success: true, data, error: null });
const fail = (code: string, message = "boom") => ({ success: false, data: null, error: { code, message } });

const account = (over: Record<string, unknown> = {}) => ({
  id: "a1",
  driver_id: "d1",
  operator: "airtel",
  label: "Principal",
  msisdn: "077123456",
  verification_status: "verified",
  rejection_reason: null,
  is_active: true,
  is_default: true,
  ...over,
});

describe("DriverPayoutNotice", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it("warns a driver with no verified number", async () => {
    mocks.getDriverPayoutAccounts.mockResolvedValue(ok([account({ verification_status: "pending" })]));
    wrap(<DriverPayoutNotice driverId="d1" />);
    expect(await screen.findByTestId("payout-notice")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ajouter mon numéro" }).getAttribute("href")).toBe("/driver/payments");
  });

  it("stays silent once a number is verified", async () => {
    mocks.getDriverPayoutAccounts.mockResolvedValue(ok([account()]));
    const { container } = wrap(<DriverPayoutNotice driverId="d1" />);
    await waitFor(() => expect(mocks.getDriverPayoutAccounts).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });

  it("stays silent while loading or when loading fails (no false alarm)", async () => {
    mocks.getDriverPayoutAccounts.mockResolvedValue(fail("NETWORK_ERROR"));
    const { container } = wrap(<DriverPayoutNotice driverId="d1" />);
    await waitFor(() => expect(mocks.getDriverPayoutAccounts).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });
});

describe("DriverPayoutAccounts", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it("says the driver cannot be ordered without a verified number", async () => {
    mocks.getDriverPayoutAccounts.mockResolvedValue(ok([]));
    wrap(<DriverPayoutAccounts driverId="d1" />);
    expect(await screen.findByText("Numéro requis")).toBeTruthy();
    expect(screen.getByText("Aucun numéro enregistré.")).toBeTruthy();
  });

  it("confirms the driver is ready and masks the number", async () => {
    mocks.getDriverPayoutAccounts.mockResolvedValue(ok([account()]));
    wrap(<DriverPayoutAccounts driverId="d1" />);
    expect(await screen.findByText("Prêt à être payé")).toBeTruthy();
    const row = screen.getByTestId("payout-a1");
    expect(row.textContent).toContain("077••••56");
    expect(row.textContent).not.toContain("077123456");
    expect(row.textContent).toContain("Vérifié");
  });

  it("adds the first number as default, then has it verified by the operator", async () => {
    mocks.getDriverPayoutAccounts.mockResolvedValue(ok([]));
    mocks.createDriverPayoutAccount.mockResolvedValue(ok({ id: "new" }));
    mocks.verifyDriverPayoutAccount.mockResolvedValue(ok({ status: "verified" }));
    wrap(<DriverPayoutAccounts driverId="d1" />);
    await screen.findByText("Numéro requis");
    fireEvent.change(screen.getByLabelText("Numéro Mobile Money"), { target: { value: "077123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Ajouter et vérifier le numéro" }));

    await waitFor(() =>
      expect(mocks.createDriverPayoutAccount).toHaveBeenCalledWith({ driverId: "d1", operator: "airtel", label: "", msisdn: "077123456", isDefault: true }),
    );
    await waitFor(() => expect(mocks.verifyDriverPayoutAccount).toHaveBeenCalledWith("new"));
  });

  it("explains a number the operator could not verify", async () => {
    mocks.getDriverPayoutAccounts.mockResolvedValue(ok([]));
    mocks.createDriverPayoutAccount.mockResolvedValue(ok({ id: "new" }));
    mocks.verifyDriverPayoutAccount.mockResolvedValue(fail("CUSTOMER_UNKNOWN", "Numero inconnu chez l'operateur"));
    wrap(<DriverPayoutAccounts driverId="d1" />);
    await screen.findByText("Numéro requis");
    fireEvent.change(screen.getByLabelText("Numéro Mobile Money"), { target: { value: "077123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Ajouter et vérifier le numéro" }));
    expect(await screen.findByText("Numero inconnu chez l'operateur")).toBeTruthy();
  });

  it("shows a validation error from the service and does not verify", async () => {
    mocks.getDriverPayoutAccounts.mockResolvedValue(ok([]));
    mocks.createDriverPayoutAccount.mockResolvedValue(fail("INVALID_PHONE", "Numero Airtel invalide"));
    wrap(<DriverPayoutAccounts driverId="d1" />);
    await screen.findByText("Numéro requis");
    fireEvent.change(screen.getByLabelText("Numéro Mobile Money"), { target: { value: "123" } });
    fireEvent.click(screen.getByRole("button", { name: "Ajouter et vérifier le numéro" }));
    expect(await screen.findByText("Numero Airtel invalide")).toBeTruthy();
    expect(mocks.verifyDriverPayoutAccount).not.toHaveBeenCalled();
  });

  it("lets the driver retry the verification of a pending number", async () => {
    mocks.getDriverPayoutAccounts.mockResolvedValue(ok([account({ verification_status: "pending" })]));
    mocks.verifyDriverPayoutAccount.mockResolvedValue(ok({ status: "verified" }));
    wrap(<DriverPayoutAccounts driverId="d1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Vérifier" }));
    await waitFor(() => expect(mocks.verifyDriverPayoutAccount).toHaveBeenCalledWith("a1"));
  });
});
