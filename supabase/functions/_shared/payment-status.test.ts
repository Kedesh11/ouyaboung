import {
  normalizeCode,
  normalizeStatus,
  resolveFinalStatus,
} from "./payment-status";

describe("payment-status", () => {
  it("normalizes status and code", () => {
    expect(normalizeStatus(" success ")).toBe("SUCCESS");
    expect(normalizeStatus(null)).toBe("");
    expect(normalizeCode("200")).toBe(200);
    expect(normalizeCode(200)).toBe(200);
    expect(normalizeCode("abc")).toBeNull();
  });

  it("resolves SUCCESS for status success with numeric or string 200", () => {
    expect(resolveFinalStatus("SUCCESS", 200)).toBe("SUCCESS");
    expect(resolveFinalStatus("success", "200")).toBe("SUCCESS");
    expect(resolveFinalStatus("success", null)).toBe("SUCCESS");
  });

  it("resolves FAILED for failed statuses", () => {
    expect(resolveFinalStatus("FAILED", 200)).toBe("FAILED");
    expect(resolveFinalStatus("error", "500")).toBe("FAILED");
    expect(resolveFinalStatus("cancelled", null)).toBe("FAILED");
  });

  it("resolves PENDING for unknown states", () => {
    expect(resolveFinalStatus("PENDING", 102)).toBe("PENDING");
    expect(resolveFinalStatus("PROCESSING", null)).toBe("PENDING");
    expect(resolveFinalStatus("", "")).toBe("PENDING");
  });
});
