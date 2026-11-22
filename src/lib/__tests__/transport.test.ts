import { describe, expect, it } from "vitest";
import {
  closedReasonLabel,
  formatCountdown,
  isActiveTransport,
  mapsDirectionsUrl,
  remainingSeconds,
  TRANSPORT_PROPOSAL_TTL_SECONDS,
} from "@/lib/transport";

describe("transport helpers", () => {
  it("keeps the 180 s answer delay in line with the database", () => {
    expect(TRANSPORT_PROPOSAL_TTL_SECONDS).toBe(180);
  });

  it("counts down from the server value and the time elapsed since it was received", () => {
    expect(remainingSeconds(180, 1_000, 1_000)).toBe(180);
    expect(remainingSeconds(180, 1_000, 61_000)).toBe(120);
    expect(remainingSeconds(10, 0, 60_000)).toBe(0);
    expect(remainingSeconds(null, 0, 5_000)).toBe(0);
  });

  it("formats the countdown", () => {
    expect(formatCountdown(180)).toBe("3 min 00 s");
    expect(formatCountdown(125)).toBe("2 min 05 s");
    expect(formatCountdown(45)).toBe("45 s");
    expect(formatCountdown(-3)).toBe("0 s");
  });

  it("knows which statuses are in progress", () => {
    expect(["proposed", "accepted", "picked_up"].every((s) => isActiveTransport(s as never))).toBe(true);
    expect(["delivered", "cancelled", "no_driver"].some((s) => isActiveTransport(s as never))).toBe(false);
    expect(isActiveTransport(undefined)).toBe(false);
  });

  it("explains why a request was closed", () => {
    expect(closedReasonLabel("proposal_expired")).toContain("3 minutes");
    expect(closedReasonLabel("declined")).toContain("refusé");
    expect(closedReasonLabel(null)).toBe("");
  });

  it("builds a directions link to the pickup point", () => {
    expect(mapsDirectionsUrl(0.4162, 9.4673)).toBe("https://www.google.com/maps/dir/?api=1&destination=0.4162,9.4673");
  });
});

import { estimateTransportFare, formatFare } from "@/lib/transport";

describe("fare helpers", () => {
  const camionnette = { base_fee: 3000, price_per_km: 800, min_fare: 4000 };

  it("mirrors the database formula (same example as the SQL tests)", () => {
    // 144.6 km -> 3000 + ceil(144.6 x 800) = 118 680 -> rounded up to 118 700, 10 % commission.
    expect(estimateTransportFare(camionnette, 144.6, 0.1)).toEqual({ fare: 118700, platformFee: 11870, driverNet: 106830 });
  });

  it("applies the minimum fare on a very short trip", () => {
    expect(estimateTransportFare({ base_fee: 1000, price_per_km: 300, min_fare: 1500 }, 0, 0.1).fare).toBe(1500);
  });

  it("always splits the fare exactly between the platform and the driver", () => {
    const { fare, platformFee, driverNet } = estimateTransportFare(camionnette, 33.3, 0.15);
    expect(platformFee + driverNet).toBe(fare);
  });

  it("formats amounts in FCFA with spaces", () => {
    expect(formatFare(118700)).toBe("118 700 FCFA");
    expect(formatFare(850)).toBe("850 FCFA");
    expect(formatFare(null)).toBe("—");
  });
});
