// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getAvailableDrivers: vi.fn() }));
vi.mock("@/api/driver-presence.api", () => ({ getAvailableDrivers: mocks.getAvailableDrivers }));

import { useAvailableDrivers } from "@/hooks/useAvailableDrivers";
import { DRIVERS_MAP_POLL_MS } from "@/lib/driver-presence";

// One QueryClient per test: creating it inside the wrapper would reset the cache on every re-render.
let wrapper: ({ children }: { children: ReactNode }) => JSX.Element;

const driver = (id: string) => ({ driver_id: id, display_name: `Chauffeur ${id}`, vehicle_type: "camionnette", distance_km: 1 });
const ok = (drivers: unknown[]) => ({ success: true, data: drivers, error: null });
const fail = (code: string) => ({ success: false, data: null, error: { code, message: code } });

const LIBREVILLE = { latitude: 0.4162, longitude: 9.4673 };

// Advances the fake clock in small steps until the condition holds, instead of guessing exact delays
// (a retry is only scheduled once the failed request has been processed).
const advanceUntil = async (predicate: () => boolean, stepMs = 1000, maxSteps = 15) => {
  for (let i = 0; i < maxSteps && !predicate(); i += 1) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(stepMs);
    });
  }
};

describe("useAvailableDrivers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAvailableDrivers.mockResolvedValue(ok([driver("a")]));
    const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
    wrapper = ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("loads the drivers around the center with the requested radius and vehicle type", async () => {
    const { result } = renderHook(() => useAvailableDrivers({ center: LIBREVILLE, radiusKm: 10, vehicleType: "moto" }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([driver("a")]);
    expect(mocks.getAvailableDrivers).toHaveBeenCalledWith({ latitude: 0.4162, longitude: 9.4673, radiusKm: 10, vehicleType: "moto" });
  });

  it("does not query until a center is known, nor when disabled", async () => {
    const { rerender } = renderHook(({ center, enabled }) => useAvailableDrivers({ center, radiusKm: 10, vehicleType: null, enabled }), {
      wrapper,
      initialProps: { center: null as typeof LIBREVILLE | null, enabled: true },
    });
    await act(async () => Promise.resolve());
    expect(mocks.getAvailableDrivers).not.toHaveBeenCalled();

    rerender({ center: LIBREVILLE, enabled: false });
    await act(async () => Promise.resolve());
    expect(mocks.getAvailableDrivers).not.toHaveBeenCalled();

    rerender({ center: LIBREVILLE, enabled: true });
    await waitFor(() => expect(mocks.getAvailableDrivers).toHaveBeenCalledTimes(1));
  });

  it("keeps polling at the configured cadence (live positions)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result } = renderHook(() => useAvailableDrivers({ center: LIBREVILLE, radiusKm: 10, vehicleType: null }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocks.getAvailableDrivers).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(DRIVERS_MAP_POLL_MS + 100);
    });
    expect(mocks.getAvailableDrivers).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(DRIVERS_MAP_POLL_MS);
    });
    expect(mocks.getAvailableDrivers).toHaveBeenCalledTimes(3);
  });

  it("picks up a driver who just became free on the next poll", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result } = renderHook(() => useAvailableDrivers({ center: LIBREVILLE, radiusKm: 10, vehicleType: null }), { wrapper });
    await waitFor(() => expect(result.current.data).toHaveLength(1));

    mocks.getAvailableDrivers.mockResolvedValue(ok([driver("a"), driver("b")]));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DRIVERS_MAP_POLL_MS + 100);
    });
    await waitFor(() => expect(result.current.data).toHaveLength(2));
  });

  it("does not re-query for a tiny movement of the center (~100 m rounding)", async () => {
    const { result, rerender } = renderHook(({ center }) => useAvailableDrivers({ center, radiusKm: 10, vehicleType: null }), {
      wrapper,
      initialProps: { center: LIBREVILLE },
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    rerender({ center: { latitude: 0.41621, longitude: 9.46731 } });
    await act(async () => Promise.resolve());
    expect(mocks.getAvailableDrivers).toHaveBeenCalledTimes(1);

    rerender({ center: { latitude: 0.5, longitude: 9.6 } });
    await waitFor(() => expect(mocks.getAvailableDrivers).toHaveBeenCalledTimes(2));
  });

  it("keeps showing the previous list while a new filter loads", async () => {
    let release: (v: unknown) => void = () => undefined;
    const { result, rerender } = renderHook(({ vehicleType }) => useAvailableDrivers({ center: LIBREVILLE, radiusKm: 10, vehicleType }), {
      wrapper,
      initialProps: { vehicleType: null as "moto" | null },
    });
    await waitFor(() => expect(result.current.data).toEqual([driver("a")]));

    mocks.getAvailableDrivers.mockReturnValue(new Promise((resolve) => (release = resolve)));
    rerender({ vehicleType: "moto" });
    await waitFor(() => expect(result.current.isFetching).toBe(true));
    expect(result.current.data).toEqual([driver("a")]); // no blank map

    await act(async () => release(ok([driver("m")])));
    await waitFor(() => expect(result.current.data).toEqual([driver("m")]));
  });

  it("exposes the server's error code", async () => {
    mocks.getAvailableDrivers.mockResolvedValue(fail("OFFLINE"));
    const { result } = renderHook(() => useAvailableDrivers({ center: LIBREVILLE, radiusKm: 10, vehicleType: null }), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 4000 });
    expect(result.current.error?.code).toBe("OFFLINE");
  });

  it("does not retry an authorization error", async () => {
    mocks.getAvailableDrivers.mockResolvedValue(fail("FORBIDDEN"));
    const { result } = renderHook(() => useAvailableDrivers({ center: LIBREVILLE, radiusKm: 10, vehicleType: null }), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.code).toBe("FORBIDDEN");
    expect(mocks.getAvailableDrivers).toHaveBeenCalledTimes(1);
  });

  it("keeps the last known list when a later poll fails (weak connection)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result } = renderHook(() => useAvailableDrivers({ center: LIBREVILLE, radiusKm: 10, vehicleType: null }), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual([driver("a")]));

    mocks.getAvailableDrivers.mockResolvedValue(fail("NETWORK_ERROR"));
    await advanceUntil(() => result.current.isError);

    expect(result.current.isError).toBe(true);
    expect(result.current.data).toEqual([driver("a")]); // the last known list survives the failure
  });
});
