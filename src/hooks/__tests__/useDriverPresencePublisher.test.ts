// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ updateDriverPresence: vi.fn() }));
vi.mock("@/api/driver-presence.api", () => ({ updateDriverPresence: mocks.updateDriverPresence }));

import { useDriverPresencePublisher } from "@/hooks/useDriverPresencePublisher";
import { PRESENCE_HEARTBEAT_MS, PRESENCE_MIN_INTERVAL_MS } from "@/lib/driver-presence";

const T0 = new Date("2026-11-22T10:00:00Z").getTime();

type PositionCb = (p: GeolocationPosition) => void;
type ErrorCb = (e: GeolocationPositionError) => void;

let onPosition: PositionCb;
let onError: ErrorCb;
const watchPosition = vi.fn();
const clearWatch = vi.fn();

const fix = (latitude: number, longitude: number, extra: Partial<GeolocationCoordinates> = {}) =>
  ({
    coords: { latitude, longitude, heading: null, speed: null, accuracy: 10, altitude: null, altitudeAccuracy: null, ...extra },
    timestamp: Date.now(),
  }) as GeolocationPosition;

const emit = async (position: GeolocationPosition) => {
  await act(async () => {
    onPosition(position);
  });
};

const advance = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

const setOnline = (online: boolean) => Object.defineProperty(navigator, "onLine", { value: online, configurable: true });

describe("useDriverPresencePublisher", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    vi.clearAllMocks();
    setOnline(true);
    watchPosition.mockImplementation((success: PositionCb, error: ErrorCb) => {
      onPosition = success;
      onError = error;
      return 42;
    });
    Object.defineProperty(navigator, "geolocation", { value: { watchPosition, clearWatch }, configurable: true });
    mocks.updateDriverPresence.mockResolvedValue({ success: true, data: { is_available: true, throttled: false }, error: null });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("does nothing while disabled", () => {
    const { result } = renderHook(() => useDriverPresencePublisher(false));
    expect(result.current.status).toBe("off");
    expect(watchPosition).not.toHaveBeenCalled();
  });

  it("reports unavailable when the device has no geolocation", () => {
    Object.defineProperty(navigator, "geolocation", { value: undefined, configurable: true });
    const { result } = renderHook(() => useDriverPresencePublisher(true));
    expect(result.current.status).toBe("unavailable");
  });

  it("starts a high-accuracy watch and publishes the first fix", async () => {
    const { result } = renderHook(() => useDriverPresencePublisher(true));
    expect(result.current.status).toBe("starting");
    expect(watchPosition).toHaveBeenCalledWith(expect.any(Function), expect.any(Function), expect.objectContaining({ enableHighAccuracy: true }));

    await emit(fix(0.4162, 9.4673, { heading: 90, speed: 5, accuracy: 12 }));

    expect(mocks.updateDriverPresence).toHaveBeenCalledWith({ latitude: 0.4162, longitude: 9.4673, heading: 90, speed: 5, accuracy: 12 });
    expect(result.current.status).toBe("sharing");
    expect(result.current.lastSentAt).toBe(T0);
  });

  it("sends null (not NaN) for unknown heading, speed and accuracy", async () => {
    renderHook(() => useDriverPresencePublisher(true));
    await emit(fix(0.4162, 9.4673, { heading: NaN as unknown as number, speed: null, accuracy: NaN as unknown as number }));
    expect(mocks.updateDriverPresence).toHaveBeenCalledWith(expect.objectContaining({ heading: null, speed: null, accuracy: null }));
  });

  it("does not publish again before the minimum interval, however many GPS events arrive", async () => {
    renderHook(() => useDriverPresencePublisher(true));
    await emit(fix(0.4162, 9.4673));
    for (let i = 1; i <= 5; i += 1) {
      await advance(1000);
      await emit(fix(0.4162 + i * 0.001, 9.4673)); // moving fast, but too soon
    }
    expect(mocks.updateDriverPresence).toHaveBeenCalledTimes(1);
  });

  it("publishes again once the interval passed and the driver moved", async () => {
    renderHook(() => useDriverPresencePublisher(true));
    await emit(fix(0.4162, 9.4673));
    await advance(PRESENCE_MIN_INTERVAL_MS + 100);
    await emit(fix(0.4262, 9.4673)); // ~1.1 km
    expect(mocks.updateDriverPresence).toHaveBeenCalledTimes(2);
    expect(mocks.updateDriverPresence).toHaveBeenLastCalledWith(expect.objectContaining({ latitude: 0.4262 }));
  });

  it("keeps a stationary driver visible with a heartbeat, without any new GPS event", async () => {
    const { result } = renderHook(() => useDriverPresencePublisher(true));
    await emit(fix(0.4162, 9.4673));
    expect(mocks.updateDriverPresence).toHaveBeenCalledTimes(1);

    await advance(PRESENCE_HEARTBEAT_MS - 6_000);
    expect(mocks.updateDriverPresence).toHaveBeenCalledTimes(1); // still quiet

    await advance(11_000);
    expect(mocks.updateDriverPresence).toHaveBeenCalledTimes(2);
    expect(mocks.updateDriverPresence).toHaveBeenLastCalledWith(expect.objectContaining({ latitude: 0.4162, longitude: 9.4673 }));
    expect(result.current.lastSentAt).toBeGreaterThan(T0);
  });

  it("maps a refused permission and a lost signal to different statuses", async () => {
    const { result } = renderHook(() => useDriverPresencePublisher(true));
    await act(async () => onError({ code: 1, message: "denied" } as GeolocationPositionError));
    expect(result.current.status).toBe("denied");
    await act(async () => onError({ code: 3, message: "timeout" } as GeolocationPositionError));
    expect(result.current.status).toBe("unavailable");
  });

  it("flags a failed send as an error and recovers on the next attempt", async () => {
    mocks.updateDriverPresence.mockResolvedValueOnce({ success: false, data: null, error: { code: "NETWORK_ERROR", message: "x" } });
    const { result } = renderHook(() => useDriverPresencePublisher(true));

    await emit(fix(0.4162, 9.4673));
    expect(result.current.status).toBe("error");
    expect(result.current.lastSentAt).toBeNull();

    await advance(PRESENCE_MIN_INTERVAL_MS + 100); // next tick retries the same position
    expect(mocks.updateDriverPresence).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe("sharing");
  });

  it("never runs two publications at once", async () => {
    let release: (v: unknown) => void = () => undefined;
    mocks.updateDriverPresence.mockReturnValue(new Promise((resolve) => (release = resolve)));
    renderHook(() => useDriverPresencePublisher(true));

    await emit(fix(0.4162, 9.4673));
    await advance(PRESENCE_HEARTBEAT_MS + 1000); // many ticks while the first call is still pending
    expect(mocks.updateDriverPresence).toHaveBeenCalledTimes(1);

    await act(async () => release({ success: true, data: { is_available: true, throttled: false }, error: null }));
  });

  it("sends nothing while the device is offline", async () => {
    setOnline(false);
    renderHook(() => useDriverPresencePublisher(true));
    await emit(fix(0.4162, 9.4673));
    expect(mocks.updateDriverPresence).not.toHaveBeenCalled();

    setOnline(true);
    await advance(6_000);
    expect(mocks.updateDriverPresence).toHaveBeenCalledTimes(1); // picked up by the next tick
  });

  it("stops watching and ticking when disabled or unmounted", async () => {
    const { result, rerender, unmount } = renderHook(({ on }) => useDriverPresencePublisher(on), { initialProps: { on: true } });
    await emit(fix(0.4162, 9.4673));

    rerender({ on: false });
    expect(clearWatch).toHaveBeenCalledWith(42);
    expect(result.current.status).toBe("off");

    await advance(PRESENCE_HEARTBEAT_MS * 2);
    expect(mocks.updateDriverPresence).toHaveBeenCalledTimes(1); // no heartbeat after disabling

    rerender({ on: true });
    expect(watchPosition).toHaveBeenCalledTimes(2);
    unmount();
    expect(clearWatch).toHaveBeenCalledTimes(2);
  });

  it("forgets the previous position when re-enabled, so the first fix is published at once", async () => {
    const { rerender } = renderHook(({ on }) => useDriverPresencePublisher(on), { initialProps: { on: true } });
    await emit(fix(0.4162, 9.4673));
    rerender({ on: false });
    rerender({ on: true });
    await emit(fix(0.4162, 9.4673));
    expect(mocks.updateDriverPresence).toHaveBeenCalledTimes(2);
  });
});
