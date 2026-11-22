// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getAdminFeeSettings: vi.fn(), updateFeeSettings: vi.fn() }));
vi.mock("@/api/fees.api", () => ({ getAdminFeeSettings: mocks.getAdminFeeSettings, updateFeeSettings: mocks.updateFeeSettings }));

import AdminFeesPage from "../../../../app/(dashboard)/admin/fees/page";

const ok = (data: unknown) => ({ success: true, data, error: null });
const fail = (code: string, message = "boom") => ({ success: false, data: null, error: { code, message } });

const data = (over: Record<string, unknown> = {}) => ({
  settings: {
    order_commission_rate: 0.1,
    transport_commission_rate: 0.1,
    pvit_fee_rate: 0.025,
    airtel_fee_rate: 0.01,
    moov_fee_rate: 0.01,
    updated_at: "2026-11-22T10:00:00Z",
  },
  history: [],
  ...over,
});

const renderPage = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AdminFeesPage />
    </QueryClientProvider>,
  );
};

const input = (id: string) => document.getElementById(id) as HTMLInputElement;
const saveButton = () => screen.getByRole("button", { name: "Enregistrer" }) as HTMLButtonElement;
const change = (id: string, value: string) => fireEvent.change(input(id), { target: { value } });

describe("AdminFeesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAdminFeeSettings.mockResolvedValue(ok(data()));
  });
  afterEach(cleanup);

  it("shows every variable as a percentage, with a preview for 10 000 FCFA", async () => {
    renderPage();
    await screen.findByTestId("preview-order");
    expect(input("order_commission_rate").value).toBe("10");
    expect(input("transport_commission_rate").value).toBe("10");
    expect(input("pvit_fee_rate").value).toBe("2.5");
    expect(input("airtel_fee_rate").value).toBe("1");
    expect(input("moov_fee_rate").value).toBe("1");
    expect(screen.getByTestId("preview-order-airtel").textContent).toBe("11 385 FCFA");
    expect(screen.getByTestId("preview-order").textContent).toContain("reçoit 10 000 FCFA");
  });

  it("says that the commissions are paid by the customer, not taken from the merchant or the driver", async () => {
    renderPage();
    await screen.findByTestId("preview-order");
    expect(document.body.textContent).toContain("payées par le client");
    expect(document.body.textContent).toContain("Le marchand reçoit son prix en entier");
    expect(document.body.textContent).toContain("Le chauffeur reçoit son tarif en entier");
  });

  it("updates the preview as the admin types, before saving", async () => {
    renderPage();
    await screen.findByTestId("preview-order");
    change("pvit_fee_rate", "3");
    // 10 000 + 1 000 + ceil(11 000 x 3 %) 330 + ceil(11 000 x 1 %) 110
    expect(screen.getByTestId("preview-order-airtel").textContent).toBe("11 440 FCFA");
    change("moov_fee_rate", "2");
    expect(screen.getByTestId("preview-transport-moov").textContent).toBe("11 550 FCFA");
  });

  it("keeps Save disabled until something changes", async () => {
    renderPage();
    await screen.findByTestId("preview-order");
    expect(saveButton().disabled).toBe(true);
    expect(screen.getByText("Aucune modification.")).toBeTruthy();
    change("pvit_fee_rate", "3");
    expect(saveButton().disabled).toBe(false);
  });

  it("asks for confirmation, listing the change and warning that everyone will be notified, before calling the server", async () => {
    renderPage();
    await screen.findByTestId("preview-order");
    change("order_commission_rate", "12");
    fireEvent.click(saveButton());
    const box = screen.getByTestId("fee-confirmation");
    expect(box.textContent).toContain("Commission sur les commandes");
    expect(box.textContent).toContain("10 % → 12 %");
    expect(box.textContent).toContain("Tous les utilisateurs");
    expect(box.textContent).toContain("notification");
    expect(mocks.updateFeeSettings).not.toHaveBeenCalled();
  });

  it("can back out of the confirmation without saving", async () => {
    renderPage();
    await screen.findByTestId("preview-order");
    change("order_commission_rate", "12");
    fireEvent.click(saveButton());
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
    expect(screen.queryByTestId("fee-confirmation")).toBeNull();
    expect(mocks.updateFeeSettings).not.toHaveBeenCalled();
  });

  it("saves the five rates as fractions, then reports how many users were informed", async () => {
    mocks.updateFeeSettings.mockResolvedValue(ok({ changed: true, notified: 42, changes: [] }));
    renderPage();
    await screen.findByTestId("preview-order");
    change("order_commission_rate", "12");
    change("pvit_fee_rate", "3");
    change("moov_fee_rate", "1,5");
    fireEvent.click(saveButton());
    fireEvent.click(screen.getByRole("button", { name: "Confirmer et notifier tout le monde" }));
    await waitFor(() =>
      expect(mocks.updateFeeSettings).toHaveBeenCalledWith({
        order_commission_rate: 0.12,
        transport_commission_rate: 0.1,
        pvit_fee_rate: 0.03,
        airtel_fee_rate: 0.01,
        moov_fee_rate: 0.015,
      }),
    );
    expect(await screen.findByText(/42 utilisateurs ont été informés/)).toBeTruthy();
  });

  it("refuses values outside the allowed range and does not offer to save", async () => {
    renderPage();
    await screen.findByTestId("preview-order");
    change("order_commission_rate", "60");
    expect(screen.getByText("Valeur comprise entre 0 et 50 %.")).toBeTruthy();
    expect(saveButton().disabled).toBe(true);
    change("order_commission_rate", "10");
    change("pvit_fee_rate", "25");
    expect(screen.getByText("Valeur comprise entre 0 et 20 %.")).toBeTruthy();
    expect(saveButton().disabled).toBe(true);
    change("pvit_fee_rate", "abc");
    expect(saveButton().disabled).toBe(true);
    change("pvit_fee_rate", "");
    expect(saveButton().disabled).toBe(true);
    expect(screen.getByTestId("preview-order").textContent).toContain("Saisissez des valeurs valides");
  });

  it("shows the server's error when the save is rejected", async () => {
    mocks.updateFeeSettings.mockResolvedValue(fail("INVALID_VALUE", "Taux invalide"));
    renderPage();
    await screen.findByTestId("preview-order");
    change("order_commission_rate", "12");
    fireEvent.click(saveButton());
    fireEvent.click(screen.getByRole("button", { name: "Confirmer et notifier tout le monde" }));
    expect(await screen.findByText("Taux invalide")).toBeTruthy();
  });

  it("lists the history of changes with the author", async () => {
    mocks.getAdminFeeSettings.mockResolvedValue(
      ok(
        data({
          history: [
            {
              id: "h1",
              changed_at: "2026-11-22T09:00:00Z",
              changed_by_name: "Admin Un",
              changes: [{ field: "pvit_fee_rate", label: "Frais PVIT", old: 0.02, new: 0.025 }],
            },
          ],
        }),
      ),
    );
    renderPage();
    const entry = await screen.findByTestId("fee-history-entry");
    expect(entry.textContent).toContain("Admin Un");
    expect(entry.textContent).toContain("Frais PVIT");
    expect(entry.textContent).toContain("2 % → 2,5 %");
  });

  it("tells a non-admin that access is reserved", async () => {
    mocks.getAdminFeeSettings.mockResolvedValue(fail("FORBIDDEN"));
    renderPage();
    expect(await screen.findByText("Accès réservé")).toBeTruthy();
    expect(screen.queryByTestId("preview-order")).toBeNull();
  });

  it("reports a loading failure", async () => {
    mocks.getAdminFeeSettings.mockResolvedValue(fail("NETWORK_ERROR"));
    renderPage();
    expect(await screen.findByText("Chargement impossible", {}, { timeout: 4000 })).toBeTruthy();
  });
});
