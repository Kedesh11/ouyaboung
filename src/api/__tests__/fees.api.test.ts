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

import { getAdminFeeSettings, getFeeBreakdown, getFeeSchedule, updateFeeSettings } from "@/api/fees.api";

describe("fees.api", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isSupabaseConfigured.mockReturnValue(true);
    mocks.isBrowserOffline.mockReturnValue(false);
    mocks.requireSupabaseClient.mockReturnValue({ rpc: mocks.rpc });
  });

  it("asks the server for the breakdown instead of computing it", async () => {
    mocks.rpc.mockResolvedValue({ data: { success: true, total_amount: 11385, platform_fee: 1000 }, error: null });
    const res = await getFeeBreakdown("order", 10000, "airtel");
    expect(res.data).toMatchObject({ total_amount: 11385 });
    expect(mocks.rpc).toHaveBeenCalledWith("compute_fee_breakdown", { p_flow: "order", p_base_amount: 10000, p_operator: "airtel" });
  });

  it("surfaces a refused amount", async () => {
    mocks.rpc.mockResolvedValue({ data: { success: false, code: "INVALID_AMOUNT" }, error: null });
    expect(await getFeeBreakdown("order", 0, "airtel")).toMatchObject({ success: false, error: { code: "INVALID_AMOUNT" } });
  });

  it("reads the current schedule", async () => {
    mocks.rpc.mockResolvedValue({ data: { success: true, order_commission_rate: 0.1 }, error: null });
    expect((await getFeeSchedule()).data).toMatchObject({ order_commission_rate: 0.1 });
    expect(mocks.rpc).toHaveBeenCalledWith("get_fee_schedule", undefined);
  });

  it("loads the admin settings with the history", async () => {
    mocks.rpc.mockResolvedValue({ data: { success: true, settings: { pvit_fee_rate: 0.025 }, history: [{ id: "h1" }] }, error: null });
    expect((await getAdminFeeSettings()).data).toEqual({ settings: { pvit_fee_rate: 0.025 }, history: [{ id: "h1" }] });
  });

  it("tolerates a missing history", async () => {
    mocks.rpc.mockResolvedValue({ data: { success: true, settings: {} }, error: null });
    expect((await getAdminFeeSettings()).data?.history).toEqual([]);
  });

  it("reports FORBIDDEN to a non-admin", async () => {
    mocks.rpc.mockResolvedValue({ data: { success: false, code: "FORBIDDEN" }, error: null });
    expect(await getAdminFeeSettings()).toMatchObject({ success: false, error: { code: "FORBIDDEN" } });
  });

  it("sends the five rates with the right parameter names and returns how many were notified", async () => {
    mocks.rpc.mockResolvedValue({ data: { success: true, changed: true, notified: 42, changes: [{ field: "pvit_fee_rate" }] }, error: null });
    const res = await updateFeeSettings({
      order_commission_rate: 0.12,
      transport_commission_rate: 0.1,
      pvit_fee_rate: 0.03,
      airtel_fee_rate: 0.01,
      moov_fee_rate: 0.015,
    });
    expect(res.data).toEqual({ changed: true, notified: 42, changes: [{ field: "pvit_fee_rate" }] });
    expect(mocks.rpc).toHaveBeenCalledWith("admin_update_fee_settings", {
      p_order_commission_rate: 0.12,
      p_transport_commission_rate: 0.1,
      p_pvit_fee_rate: 0.03,
      p_airtel_fee_rate: 0.01,
      p_moov_fee_rate: 0.015,
    });
  });

  it("surfaces a rejected value", async () => {
    mocks.rpc.mockResolvedValue({ data: { success: false, code: "INVALID_VALUE", message: "Hors limites" }, error: null });
    expect(
      await updateFeeSettings({ order_commission_rate: 0.9, transport_commission_rate: 0.1, pvit_fee_rate: 0, airtel_fee_rate: 0, moov_fee_rate: 0 }),
    ).toMatchObject({ success: false, error: { code: "INVALID_VALUE", message: "Hors limites" } });
  });
});
