import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isSupabaseConfigured: vi.fn(),
  requireSupabaseClient: vi.fn(),
  isBrowserOffline: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/api/supabaseClient", () => ({
  isSupabaseConfigured: mocks.isSupabaseConfigured,
  requireSupabaseClient: mocks.requireSupabaseClient,
}));
vi.mock("@/lib/offline/cache", () => ({ isBrowserOffline: mocks.isBrowserOffline }));

import { getTransportPricing, updateTransportSettings, updateTransportTariff } from "@/api/transport-pricing.api";

describe("transport-pricing.api", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isSupabaseConfigured.mockReturnValue(true);
    mocks.isBrowserOffline.mockReturnValue(false);
    mocks.requireSupabaseClient.mockReturnValue({ rpc: mocks.rpc });
  });

  it("loads the tariffs and the settings", async () => {
    mocks.rpc.mockResolvedValue({
      data: { success: true, tariffs: [{ vehicle_type: "moto" }], settings: { commission_rate: 0.1 } },
      error: null,
    });
    const res = await getTransportPricing();
    expect(mocks.rpc).toHaveBeenCalledWith("admin_get_transport_pricing", undefined);
    expect(res.data).toEqual({ tariffs: [{ vehicle_type: "moto" }], settings: { commission_rate: 0.1 } });
  });

  it("reports FORBIDDEN to a non-admin", async () => {
    mocks.rpc.mockResolvedValue({ data: { success: false, code: "FORBIDDEN" }, error: null });
    expect(await getTransportPricing()).toMatchObject({ success: false, error: { code: "FORBIDDEN" } });
  });

  it("updates a tariff with the right parameters", async () => {
    mocks.rpc.mockResolvedValue({ data: { success: true, tariff: { vehicle_type: "moto", base_fee: 1200 } }, error: null });
    const res = await updateTransportTariff({ vehicle_type: "moto", base_fee: 1200, price_per_km: 300, min_fare: 1500, is_active: false });
    expect(res.data).toMatchObject({ base_fee: 1200 });
    expect(mocks.rpc).toHaveBeenCalledWith("admin_update_transport_tariff", {
      p_vehicle_type: "moto",
      p_base_fee: 1200,
      p_price_per_km: 300,
      p_min_fare: 1500,
      p_is_active: false,
    });
  });

  it("updates the settings and surfaces a rejected value", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { success: true, settings: { commission_rate: 0.15 } }, error: null });
    const ok = await updateTransportSettings({ commission_rate: 0.15, road_distance_factor: 1.3, max_distance_km: 500 });
    expect(ok.data).toEqual({ commission_rate: 0.15 });
    expect(mocks.rpc).toHaveBeenLastCalledWith("admin_update_transport_settings", {
      p_commission_rate: 0.15,
      p_road_distance_factor: 1.3,
      p_max_distance_km: 500,
    });

    mocks.rpc.mockResolvedValueOnce({ data: { success: false, code: "INVALID_VALUE", message: "Commission invalide" }, error: null });
    expect(await updateTransportSettings({ commission_rate: 0.6, road_distance_factor: 1.3, max_distance_km: 500 })).toMatchObject({
      success: false,
      error: { code: "INVALID_VALUE", message: "Commission invalide" },
    });
  });
});
