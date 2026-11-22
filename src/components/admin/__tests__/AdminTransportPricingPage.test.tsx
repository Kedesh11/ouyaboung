// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getTransportPricing: vi.fn(),
  updateTransportTariff: vi.fn(),
  updateTransportSettings: vi.fn(),
}));

vi.mock("@/api/transport-pricing.api", () => ({
  getTransportPricing: mocks.getTransportPricing,
  updateTransportTariff: mocks.updateTransportTariff,
  updateTransportSettings: mocks.updateTransportSettings,
}));

import AdminTransportPricingPage from "../../../../app/(dashboard)/admin/transport-pricing/page";

const ok = (data: unknown) => ({ success: true, data, error: null });
const fail = (code: string, message = "boom") => ({ success: false, data: null, error: { code, message } });

const pricing = (over: Record<string, unknown> = {}) => ({
  tariffs: [
    { vehicle_type: "moto", base_fee: 1000, price_per_km: 300, min_fare: 1500, is_active: true, updated_at: "2026-11-22T10:00:00Z" },
    { vehicle_type: "camionnette", base_fee: 3000, price_per_km: 800, min_fare: 4000, is_active: true, updated_at: "2026-11-22T10:00:00Z" },
  ],
  settings: { road_distance_factor: 1.3, max_distance_km: 500, payment_window_minutes: 15, updated_at: "2026-11-22T10:00:00Z" },
  ...over,
});

const renderPage = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AdminTransportPricingPage />
    </QueryClientProvider>,
  );
};

const row = (vehicle: string) => screen.getByTestId(`tariff-${vehicle}`);
const input = (id: string) => document.getElementById(id) as HTMLInputElement;

describe("AdminTransportPricingPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTransportPricing.mockResolvedValue(ok(pricing()));
  });
  afterEach(cleanup);

  it("lists every tariff with its current values and a fare preview", async () => {
    renderPage();
    expect(await screen.findByTestId("tariff-moto")).toBeTruthy();
    expect(input("moto-base_fee").value).toBe("1000");
    expect(input("camionnette-price_per_km").value).toBe("800");
    // 25 km moto: 1000 + 25 x 300 = 8 500
    expect(screen.getByTestId("preview-moto").textContent).toContain("25 km → 8 500 FCFA");
    // The commission now lives in the dedicated "Frais & commissions" page.
    expect(document.getElementById("commission")).toBeNull();
    expect(input("road-factor").value).toBe("1.3");
    expect(input("max-km").value).toBe("500");
    expect(input("pay-window").value).toBe("15");
  });

  it("keeps Save disabled until something changes, then saves the new values", async () => {
    mocks.updateTransportTariff.mockResolvedValue(ok({}));
    renderPage();
    await screen.findByTestId("tariff-moto");
    const save = () => row("moto").querySelector("button:not([role=switch])") as HTMLButtonElement;
    expect(save().disabled).toBe(true);

    fireEvent.change(input("moto-price_per_km"), { target: { value: "350" } });
    expect(save().disabled).toBe(false);
    // Preview follows the draft: 25 km -> 1000 + 25 x 350 = 9 750
    expect(screen.getByTestId("preview-moto").textContent).toContain("25 km → 9 750 FCFA");

    fireEvent.click(save());
    await waitFor(() =>
      expect(mocks.updateTransportTariff).toHaveBeenCalledWith({
        vehicle_type: "moto",
        base_fee: 1000,
        price_per_km: 350,
        min_fare: 1500,
        is_active: true,
      }),
    );
  });

  it("can switch a vehicle off", async () => {
    mocks.updateTransportTariff.mockResolvedValue(ok({}));
    renderPage();
    await screen.findByTestId("tariff-moto");
    fireEvent.click(row("moto").querySelector("[role=switch]") as HTMLElement);
    fireEvent.click(row("moto").querySelector("button:not([role=switch])") as HTMLButtonElement);
    await waitFor(() => expect(mocks.updateTransportTariff).toHaveBeenCalledWith(expect.objectContaining({ vehicle_type: "moto", is_active: false })));
  });

  it("refuses non-numeric or negative amounts before calling the server", async () => {
    renderPage();
    await screen.findByTestId("tariff-moto");
    fireEvent.change(input("moto-base_fee"), { target: { value: "-5" } });
    expect(screen.getByText(/entiers positifs uniquement/)).toBeTruthy();
    expect((row("moto").querySelector("button:not([role=switch])") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(input("moto-base_fee"), { target: { value: "abc" } });
    expect((row("moto").querySelector("button:not([role=switch])") as HTMLButtonElement).disabled).toBe(true);
    expect(mocks.updateTransportTariff).not.toHaveBeenCalled();
  });

  it("shows the server's error when a save is rejected", async () => {
    mocks.updateTransportTariff.mockResolvedValue(fail("INVALID_VALUE", "Montants invalides"));
    renderPage();
    await screen.findByTestId("tariff-moto");
    fireEvent.change(input("moto-base_fee"), { target: { value: "2000" } });
    fireEvent.click(row("moto").querySelector("button:not([role=switch])") as HTMLButtonElement);
    expect(await screen.findByText("Montants invalides")).toBeTruthy();
  });

  it("saves the distance factor and limits", async () => {
    mocks.updateTransportSettings.mockResolvedValue(ok({}));
    renderPage();
    await screen.findByTestId("tariff-moto");
    fireEvent.change(input("road-factor"), { target: { value: "1.5" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Enregistrer" }).pop() as HTMLElement);
    await waitFor(() =>
      expect(mocks.updateTransportSettings).toHaveBeenCalledWith({ road_distance_factor: 1.5, max_distance_km: 500, payment_window_minutes: 15 }),
    );
  });

  it("rejects out-of-range settings locally", async () => {
    renderPage();
    await screen.findByTestId("tariff-moto");
    fireEvent.change(input("road-factor"), { target: { value: "0.8" } });
    expect(screen.getByText(/Valeurs hors limites/)).toBeTruthy();
    expect((screen.getAllByRole("button", { name: "Enregistrer" }).pop() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(input("road-factor"), { target: { value: "1.3" } });
    fireEvent.change(input("max-km"), { target: { value: "5000" } });
    expect(screen.getByText(/Valeurs hors limites/)).toBeTruthy();
  });

  it("points the admin to the fees page for the commission", async () => {
    renderPage();
    await screen.findByTestId("tariff-moto");
    expect(screen.getByRole("link", { name: /Frais & commissions/ }).getAttribute("href")).toBe("/admin/fees");
  });

  it("saves the payment window and refuses values outside 5-180 minutes", async () => {
    mocks.updateTransportSettings.mockResolvedValue(ok({}));
    renderPage();
    await screen.findByTestId("tariff-moto");
    fireEvent.change(input("pay-window"), { target: { value: "2" } });
    expect(screen.getByText(/Valeurs hors limites/)).toBeTruthy();
    fireEvent.change(input("pay-window"), { target: { value: "181" } });
    expect(screen.getByText(/Valeurs hors limites/)).toBeTruthy();
    fireEvent.change(input("pay-window"), { target: { value: "30" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Enregistrer" }).pop() as HTMLElement);
    await waitFor(() =>
      expect(mocks.updateTransportSettings).toHaveBeenCalledWith({ road_distance_factor: 1.3, max_distance_km: 500, payment_window_minutes: 30 }),
    );
  });

  it("tells a non-admin that access is reserved", async () => {
    mocks.getTransportPricing.mockResolvedValue(fail("FORBIDDEN"));
    renderPage();
    expect(await screen.findByText("Accès réservé")).toBeTruthy();
    expect(screen.queryByTestId("tariff-moto")).toBeNull();
  });

  it("reports a loading failure", async () => {
    mocks.getTransportPricing.mockResolvedValue(fail("NETWORK_ERROR"));
    renderPage();
    // La page réessaie une fois (1 s) avant d'abandonner.
    expect(await screen.findByText("Chargement impossible", {}, { timeout: 4000 })).toBeTruthy();
  });
});
