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
    // 144.6 km -> 3000 + ceil(144.6 x 800) = 118 680 -> rounded up to 118 700. The driver gets it in full.
    expect(estimateTransportFare(camionnette, 144.6)).toBe(118700);
  });

  it("applies the minimum fare on a very short trip", () => {
    expect(estimateTransportFare({ base_fee: 1000, price_per_km: 300, min_fare: 1500 }, 0)).toBe(1500);
  });

  it("rounds up to the next 50 FCFA", () => {
    expect(estimateTransportFare({ base_fee: 1001, price_per_km: 0, min_fare: 0 }, 10)).toBe(1050);
    expect(estimateTransportFare({ base_fee: 1000, price_per_km: 0, min_fare: 0 }, 10)).toBe(1000);
  });

  it("formats amounts in FCFA with spaces", () => {
    expect(formatFare(118700)).toBe("118 700 FCFA");
    expect(formatFare(850)).toBe("850 FCFA");
    expect(formatFare(null)).toBe("—");
  });
});
