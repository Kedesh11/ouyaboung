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
  cancelTransportRequest,
  createTransportRequest,
  getMyTransportJobs,
  getMyTransportRequest,
  quoteTransport,
  respondTransportRequest,
  updateTransportJobStatus,
} from "@/api/transport.api";

describe("transport.api", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isSupabaseConfigured.mockReturnValue(true);
    mocks.isBrowserOffline.mockReturnValue(false);
    mocks.requireSupabaseClient.mockReturnValue({ rpc: mocks.rpc });
  });

  it("creates an automatic request: no driver sent, vehicle and pickup forwarded", async () => {
    mocks.rpc.mockResolvedValue({ data: { success: true, request: { id: "r1", status: "proposed" } }, error: null });
    const res = await createTransportRequest({
      mode: "auto",
      driverId: "ignored",
      dropoffAddress: "Port-Gentil",
      dropoff: { latitude: 0.3, longitude: 9.4 },
      cargoDescription: "Bananes",
      vehicleType: "camionnette",
      pickup: { latitude: 0.4, longitude: 9.45, address: "Ferme" },
    });
    expect(res.data).toEqual({ id: "r1", status: "proposed" });
    expect(mocks.rpc).toHaveBeenCalledWith("create_transport_request", {
      p_mode: "auto",
      p_driver_id: null,
      p_dropoff_address: "Port-Gentil",
      p_cargo_description: "Bananes",
      p_dropoff_latitude: 0.3,
      p_dropoff_longitude: 9.4,
      p_vehicle_type: "camionnette",
      p_pickup_latitude: 0.4,
      p_pickup_longitude: 9.45,
      p_pickup_address: "Ferme",
    });
  });

  it("creates a manual request for the chosen driver, leaving the pickup to the server", async () => {
    mocks.rpc.mockResolvedValue({ data: { success: true, request: { id: "r2" } }, error: null });
    await createTransportRequest({ mode: "manual", driverId: "d1", dropoffAddress: "Marché", dropoff: { latitude: 0.3, longitude: 9.4 }, cargoDescription: "Manioc" });
    expect(mocks.rpc.mock.calls[0][1]).toMatchObject({
      p_mode: "manual",
      p_driver_id: "d1",
      p_pickup_latitude: null,
      p_pickup_longitude: null,
      p_vehicle_type: null,
    });
  });

  it("surfaces the server's code when no driver is available", async () => {
    mocks.rpc.mockResolvedValue({ data: { success: false, code: "NO_DRIVER_AVAILABLE", message: "Aucun" }, error: null });
    const res = await createTransportRequest({ mode: "auto", dropoffAddress: "x", dropoff: { latitude: 0.3, longitude: 9.4 }, cargoDescription: "y" });
    expect(res).toMatchObject({ success: false, error: { code: "NO_DRIVER_AVAILABLE" } });
  });

  it("asks for a fixed-price quote with the vehicle, destination and optional pickup", async () => {
    mocks.rpc.mockResolvedValue({ data: { success: true, fare_amount: 118700, distance_km: 144.6 }, error: null });
    const res = await quoteTransport({ vehicleType: "camionnette", dropoff: { latitude: 1, longitude: 9.4 } });
    expect(res.data).toMatchObject({ fare_amount: 118700 });
    expect(mocks.rpc).toHaveBeenCalledWith("quote_transport", {
      p_vehicle_type: "camionnette",
      p_dropoff_latitude: 1,
      p_dropoff_longitude: 9.4,
      p_pickup_latitude: null,
      p_pickup_longitude: null,
    });
  });

  it("surfaces a refused quote (too far)", async () => {
    mocks.rpc.mockResolvedValue({ data: { success: false, code: "TOO_FAR", message: "x" }, error: null });
    expect(await quoteTransport({ vehicleType: "moto", dropoff: { latitude: 1, longitude: 9.4 } })).toMatchObject({
      success: false,
      error: { code: "TOO_FAR" },
    });
  });

  it("returns null when the farmer has no current request", async () => {
    mocks.rpc.mockResolvedValue({ data: { success: true, request: null }, error: null });
    const res = await getMyTransportRequest();
    expect(res).toMatchObject({ success: true, data: null });
    expect(mocks.rpc).toHaveBeenCalledWith("get_my_transport_request", undefined);
  });

  it("cancels a request", async () => {
    mocks.rpc.mockResolvedValue({ data: { success: true, request: { id: "r1", status: "cancelled" } }, error: null });
    expect((await cancelTransportRequest("r1")).data).toMatchObject({ status: "cancelled" });
    expect(mocks.rpc).toHaveBeenCalledWith("cancel_transport_request", { p_request_id: "r1" });
  });

  it("lists the driver's jobs, tolerating a missing array", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { success: true, jobs: [{ id: "j1" }] }, error: null });
    expect((await getMyTransportJobs()).data).toEqual([{ id: "j1" }]);
    mocks.rpc.mockResolvedValueOnce({ data: { success: true }, error: null });
    expect((await getMyTransportJobs()).data).toEqual([]);
  });

  it("accepts and declines with the right parameters", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { success: true, job: { id: "j1", status: "accepted" } }, error: null });
    expect((await respondTransportRequest("j1", true)).data).toEqual({ declined: false, job: { id: "j1", status: "accepted" } });
    expect(mocks.rpc).toHaveBeenLastCalledWith("respond_transport_request", { p_request_id: "j1", p_accept: true });

    mocks.rpc.mockResolvedValueOnce({ data: { success: true, declined: true }, error: null });
    expect((await respondTransportRequest("j1", false)).data).toEqual({ declined: true, job: null });
  });

  it("reports an expired proposal", async () => {
    mocks.rpc.mockResolvedValue({ data: { success: false, code: "PROPOSAL_NOT_AVAILABLE", message: "x" }, error: null });
    expect(await respondTransportRequest("j1", true)).toMatchObject({ success: false, error: { code: "PROPOSAL_NOT_AVAILABLE" } });
  });

  it("moves a job forward", async () => {
    mocks.rpc.mockResolvedValue({ data: { success: true, job: { id: "j1", status: "picked_up" } }, error: null });
    expect((await updateTransportJobStatus("j1", "picked_up")).data).toMatchObject({ status: "picked_up" });
    expect(mocks.rpc).toHaveBeenCalledWith("update_transport_job_status", { p_request_id: "j1", p_status: "picked_up" });
  });

  it("fails fast offline, without any call", async () => {
    mocks.isBrowserOffline.mockReturnValue(true);
    expect(await getMyTransportJobs()).toMatchObject({ success: false, error: { code: "OFFLINE" } });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
