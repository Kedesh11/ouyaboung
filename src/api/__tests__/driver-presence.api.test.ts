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

import {
  acknowledgeLocationNotice,
  getAvailableDrivers,
  getMyDriverPresence,
  setDriverAvailability,
  updateDriverPresence,
} from "@/api/driver-presence.api";

describe("driver-presence.api", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isSupabaseConfigured.mockReturnValue(true);
    mocks.isBrowserOffline.mockReturnValue(false);
    mocks.requireSupabaseClient.mockReturnValue({ rpc: mocks.rpc });
  });

  describe("shared failure handling", () => {
    it("fails fast when Supabase is not configured, without any call", async () => {
      mocks.isSupabaseConfigured.mockReturnValue(false);
      const res = await getMyDriverPresence();
      expect(res).toMatchObject({ success: false, error: { code: "NOT_CONFIGURED" } });
      expect(mocks.rpc).not.toHaveBeenCalled();
    });

    it("fails fast when the device is offline, without any call", async () => {
      mocks.isBrowserOffline.mockReturnValue(true);
      const res = await updateDriverPresence({ latitude: 0.4, longitude: 9.4 });
      expect(res).toMatchObject({ success: false, error: { code: "OFFLINE" } });
      expect(mocks.rpc).not.toHaveBeenCalled();
    });

    it("maps an RPC/SQL error to an error response", async () => {
      mocks.rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "permission denied" } });
      expect(await acknowledgeLocationNotice()).toMatchObject({ success: false, error: { code: "42501", message: "permission denied" } });
    });

    it("maps a success:false payload, keeping the server's code and message", async () => {
      mocks.rpc.mockResolvedValue({ data: { success: false, code: "NOT_APPROVED", message: "Profil non valide" }, error: null });
      expect(await setDriverAvailability(true)).toMatchObject({
        success: false,
        error: { code: "NOT_APPROVED", message: "Profil non valide" },
      });
    });

    it("treats an empty payload as a failure", async () => {
      mocks.rpc.mockResolvedValue({ data: null, error: null });
      expect(await getMyDriverPresence()).toMatchObject({ success: false, error: { code: "RPC_FAILED" } });
    });

    it("turns a thrown network error (fetch failure) into a normal failure", async () => {
      mocks.rpc.mockRejectedValue(new TypeError("Failed to fetch"));
      expect(await getAvailableDrivers({ latitude: 0.4, longitude: 9.4 })).toMatchObject({
        success: false,
        error: { code: "NETWORK_ERROR" },
      });
    });
  });

  describe("getMyDriverPresence", () => {
    it("returns the notice and availability state", async () => {
      mocks.rpc.mockResolvedValue({ data: { success: true, notice_ack_at: "2026-11-22T10:00:00Z", is_available: false, last_sent_at: null }, error: null });
      const res = await getMyDriverPresence();
      expect(mocks.rpc).toHaveBeenCalledWith("get_my_driver_presence", undefined);
      expect(res.data).toEqual({ notice_ack_at: "2026-11-22T10:00:00Z", is_available: false, last_sent_at: null });
    });

    it("defaults to available when the field is absent", async () => {
      mocks.rpc.mockResolvedValue({ data: { success: true, notice_ack_at: null }, error: null });
      expect((await getMyDriverPresence()).data).toMatchObject({ notice_ack_at: null, is_available: true });
    });
  });

  describe("writes", () => {
    it("acknowledges the location notice", async () => {
      mocks.rpc.mockResolvedValue({ data: { success: true, notice_ack_at: "2026-11-22T10:00:00Z" }, error: null });
      expect((await acknowledgeLocationNotice()).data).toEqual({ notice_ack_at: "2026-11-22T10:00:00Z" });
      expect(mocks.rpc).toHaveBeenCalledWith("acknowledge_location_notice", undefined);
    });

    it("sets availability with the right parameter name", async () => {
      mocks.rpc.mockResolvedValue({ data: { success: true, is_available: false }, error: null });
      expect((await setDriverAvailability(false)).data).toEqual({ is_available: false });
      expect(mocks.rpc).toHaveBeenCalledWith("set_driver_availability", { p_available: false });
    });

    it("publishes a position, sending nulls for missing optional fields", async () => {
      mocks.rpc.mockResolvedValue({ data: { success: true, is_available: true, throttled: true }, error: null });
      const res = await updateDriverPresence({ latitude: 0.42, longitude: 9.47 });
      expect(mocks.rpc).toHaveBeenCalledWith("update_driver_presence", {
        p_latitude: 0.42,
        p_longitude: 9.47,
        p_heading: null,
        p_speed: null,
        p_accuracy: null,
      });
      expect(res.data).toEqual({ is_available: true, throttled: true });
    });

    it("forwards heading, speed and accuracy when known", async () => {
      mocks.rpc.mockResolvedValue({ data: { success: true }, error: null });
      await updateDriverPresence({ latitude: 0.42, longitude: 9.47, heading: 90, speed: 12, accuracy: 8 });
      expect(mocks.rpc.mock.calls[0][1]).toMatchObject({ p_heading: 90, p_speed: 12, p_accuracy: 8 });
    });
  });

  describe("getAvailableDrivers", () => {
    const driver = { driver_id: "d1", display_name: "Jean D.", vehicle_type: "camionnette", distance_km: 1.2 };

    it("returns the drivers and applies sensible defaults", async () => {
      mocks.rpc.mockResolvedValue({ data: { success: true, drivers: [driver] }, error: null });
      const res = await getAvailableDrivers({ latitude: 0.4162, longitude: 9.4673 });
      expect(res.data).toEqual([driver]);
      expect(mocks.rpc).toHaveBeenCalledWith("get_available_drivers", {
        p_latitude: 0.4162,
        p_longitude: 9.4673,
        p_radius_km: 50,
        p_vehicle_type: null,
        p_limit: 50,
      });
    });

    it("passes the radius, vehicle filter and limit", async () => {
      mocks.rpc.mockResolvedValue({ data: { success: true, drivers: [] }, error: null });
      await getAvailableDrivers({ latitude: 0.4, longitude: 9.4, radiusKm: 10, vehicleType: "moto", limit: 5 });
      expect(mocks.rpc.mock.calls[0][1]).toMatchObject({ p_radius_km: 10, p_vehicle_type: "moto", p_limit: 5 });
    });

    it("returns an empty list when the payload has no drivers array", async () => {
      mocks.rpc.mockResolvedValue({ data: { success: true }, error: null });
      expect((await getAvailableDrivers({ latitude: 0.4, longitude: 9.4 })).data).toEqual([]);
    });

    it("surfaces FORBIDDEN for a non-farmer", async () => {
      mocks.rpc.mockResolvedValue({ data: { success: false, code: "FORBIDDEN", message: "Reserve aux agriculteurs approuves." }, error: null });
      expect(await getAvailableDrivers({ latitude: 0.4, longitude: 9.4 })).toMatchObject({ success: false, error: { code: "FORBIDDEN" } });
    });
  });
});
