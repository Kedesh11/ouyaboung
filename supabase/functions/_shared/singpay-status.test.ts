import {
  isFinalInternalStatus,
  mapLegacyStatus,
  mapProviderStatus,
} from "./singpay-status";

describe("singpay-status", () => {
  describe("mapProviderStatus", () => {
    it("maps a Success result to confirmed", () => {
      expect(mapProviderStatus("Terminate", "Success")).toBe("confirmed");
    });

    it("maps a TimeOutError result to expired", () => {
      expect(mapProviderStatus("Terminate", "TimeOutError")).toBe("expired");
    });

    it.each(["PasswordError", "BalanceError", "Error"])(
      "maps a %s result to failed",
      (result) => {
        expect(mapProviderStatus("Terminate", result)).toBe("failed");
      }
    );

    it("maps in-progress statuses to pending", () => {
      expect(mapProviderStatus("Start", null)).toBe("pending");
      expect(mapProviderStatus("Partenaire", null)).toBe("pending");
      expect(mapProviderStatus("Terminate", null)).toBe("pending");
    });

    it("maps a Refund status to refunded, even without a result", () => {
      expect(mapProviderStatus("Refund", null)).toBe("refunded");
    });

    it("prioritizes a Refund status over a stale Success result", () => {
      // A refund callback can arrive after an earlier Success confirmation;
      // the refund must win instead of being reported as still confirmed.
      expect(mapProviderStatus("Refund", "Success")).toBe("refunded");
    });

    it("falls back to pending for unknown/unhandled status values", () => {
      expect(mapProviderStatus("Disbursement", null)).toBe("pending");
      expect(mapProviderStatus(undefined, undefined)).toBe("pending");
    });
  });

  describe("mapLegacyStatus", () => {
    it("maps every internal status to its legacy equivalent", () => {
      expect(mapLegacyStatus("confirmed")).toBe("SUCCESS");
      expect(mapLegacyStatus("expired")).toBe("TIMEOUT");
      expect(mapLegacyStatus("failed")).toBe("FAILED");
      expect(mapLegacyStatus("cancelled")).toBe("CANCELLED");
      expect(mapLegacyStatus("refunded")).toBe("REFUNDED");
      expect(mapLegacyStatus("pending")).toBe("PENDING");
    });
  });

  describe("isFinalInternalStatus", () => {
    it("treats refunded as a final status", () => {
      expect(isFinalInternalStatus("refunded")).toBe(true);
    });

    it("treats pending as not final", () => {
      expect(isFinalInternalStatus("pending")).toBe(false);
    });

    it("treats confirmed/failed/expired/cancelled as final", () => {
      expect(isFinalInternalStatus("confirmed")).toBe(true);
      expect(isFinalInternalStatus("failed")).toBe(true);
      expect(isFinalInternalStatus("expired")).toBe(true);
      expect(isFinalInternalStatus("cancelled")).toBe(true);
    });
  });
});
