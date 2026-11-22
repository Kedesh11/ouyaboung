import { describe, expect, it } from "vitest";
import {
  ageSeconds,
  DRIVER_STALE_AFTER_MS,
  formatAge,
  formatDistance,
  isStale,
  isValidFix,
  PRESENCE_HEARTBEAT_MS,
  PRESENCE_MIN_INTERVAL_MS,
  PRESENCE_MIN_MOVE_M,
  shouldPublishPosition,
  vehicleLabel,
} from "@/lib/driver-presence";

const T0 = 1_800_000_000_000;
const here = { latitude: 0.4162, longitude: 9.4673, at: T0 };
// ~11 m north (0.0001° of latitude ≈ 11.1 m) and ~111 m north (0.001°)
const move = (meters: number, at: number) => ({
  latitude: here.latitude + meters / 111_320,
  longitude: here.longitude,
  at,
});

describe("shouldPublishPosition", () => {
  it("always publishes the very first valid fix", () => {
    expect(shouldPublishPosition(null, here)).toBe(true);
  });

  it("never publishes an invalid fix", () => {
    for (const bad of [
      { latitude: NaN, longitude: 9, at: T0 },
      { latitude: 0, longitude: Infinity, at: T0 },
      { latitude: 91, longitude: 9, at: T0 },
      { latitude: 0, longitude: -181, at: T0 },
    ]) {
      expect(shouldPublishPosition(null, bad)).toBe(false);
    }
  });

  it("never publishes faster than the minimum interval, even when moving fast", () => {
    expect(shouldPublishPosition(here, move(500, T0 + PRESENCE_MIN_INTERVAL_MS - 1))).toBe(false);
    expect(shouldPublishPosition(here, move(500, T0 + 1000))).toBe(false);
  });

  it("publishes once the interval has passed and the driver moved enough", () => {
    expect(shouldPublishPosition(here, move(PRESENCE_MIN_MOVE_M + 5, T0 + PRESENCE_MIN_INTERVAL_MS))).toBe(true);
  });

  it("stays quiet for a stationary driver between heartbeats (saves data and battery)", () => {
    expect(shouldPublishPosition(here, move(3, T0 + PRESENCE_MIN_INTERVAL_MS + 1000))).toBe(false);
    expect(shouldPublishPosition(here, { ...here, at: T0 + PRESENCE_HEARTBEAT_MS - 1000 })).toBe(false);
  });

  it("sends a heartbeat for a stationary driver so they stay visible", () => {
    expect(shouldPublishPosition(here, { ...here, at: T0 + PRESENCE_HEARTBEAT_MS })).toBe(true);
  });

  it("keeps the heartbeat well inside the server's freshness window (2 min)", () => {
    expect(PRESENCE_HEARTBEAT_MS).toBeLessThan(DRIVER_STALE_AFTER_MS / 2);
  });

  it("honours custom policies", () => {
    const policy = { minIntervalMs: 1000, heartbeatMs: 5000, minMoveM: 100 };
    expect(shouldPublishPosition(here, move(50, T0 + 2000), policy)).toBe(false);
    expect(shouldPublishPosition(here, move(150, T0 + 2000), policy)).toBe(true);
    expect(shouldPublishPosition(here, { ...here, at: T0 + 5000 }, policy)).toBe(true);
  });
});

describe("isValidFix", () => {
  it("accepts real coordinates and rejects anything else", () => {
    expect(isValidFix(0.4, 9.4)).toBe(true);
    expect(isValidFix(-90, 180)).toBe(true);
    expect(isValidFix("0.4", 9.4)).toBe(false);
    expect(isValidFix(null, undefined)).toBe(false);
    expect(isValidFix(90.01, 0)).toBe(false);
  });
});

describe("ageSeconds / formatAge / isStale", () => {
  it("computes the age from an ISO date or a timestamp, never negative", () => {
    expect(ageSeconds(new Date(T0 - 12_500).toISOString(), T0)).toBe(12);
    expect(ageSeconds(T0 - 30_000, T0)).toBe(30);
    expect(ageSeconds(new Date(T0 + 5000).toISOString(), T0)).toBe(0); // clock skew
    expect(ageSeconds("not a date", T0)).toBe(Number.POSITIVE_INFINITY);
  });

  it("formats an age in French", () => {
    expect(formatAge(0)).toBe("à l'instant");
    expect(formatAge(9)).toBe("à l'instant");
    expect(formatAge(10)).toBe("il y a 10 s");
    expect(formatAge(59)).toBe("il y a 59 s");
    expect(formatAge(60)).toBe("il y a 1 min");
    expect(formatAge(185)).toBe("il y a 3 min");
    expect(formatAge(Number.POSITIVE_INFINITY)).toBe("inconnue");
  });

  it("treats a position as stale at the same threshold as the server", () => {
    expect(isStale(119)).toBe(false);
    expect(isStale(120)).toBe(true);
    expect(isStale(500)).toBe(true);
  });
});

describe("labels", () => {
  it("translates vehicle types and falls back for unknown ones", () => {
    expect(vehicleLabel("camionnette")).toBe("Camionnette");
    expect(vehicleLabel("moto")).toBe("Moto");
    expect(vehicleLabel("fusee")).toBe("Autre");
  });

  it("formats distances: metres under 1 km, km above", () => {
    expect(formatDistance(0.004)).toBe("10 m"); // never "0 m"
    expect(formatDistance(0.04)).toBe("40 m");
    expect(formatDistance(0.453)).toBe("450 m");
    expect(formatDistance(0.999)).toBe("1 km"); // rounds up to a kilometre, not "1000 m"
    expect(formatDistance(1)).toBe("1 km");
    expect(formatDistance(12.34)).toBe("12,3 km");
  });
});
