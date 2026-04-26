import {
  decodeBase64Payload,
  extractPickupCode,
  isLikelyPickupCode,
  normalizePickupCode,
} from "@/lib/qr/pickup-code";

describe("pickup-code helpers", () => {
  it("normalizes and validates pickup codes", () => {
    expect(normalizePickupCode("pk-12 ab_34")).toBe("PK12AB34");
    expect(isLikelyPickupCode("PK12AB34")).toBe(true);
    expect(isLikelyPickupCode("A12")).toBe(false);
  });

  it("extracts direct pickup code without corrupting base64-like values", () => {
    expect(extractPickupCode("PK123456ABCDEF")).toBe("PK123456ABCDEF");
    expect(extractPickupCode("pk 1234 56ab cdef")).toBe("PK123456ABCDEF");
  });

  it("extracts code from URLs and query/hash", () => {
    expect(extractPickupCode("https://example.com/scan?pickup_code=pk12-34ab56")).toBe("PK1234AB56");
    expect(extractPickupCode("https://example.com/#code=pk98-76yy11")).toBe("PK9876YY11");
    expect(extractPickupCode("https://example.com/merchant/scan/PK1122AA33")).toBe("PK1122AA33");
  });

  it("extracts code from JSON payload", () => {
    expect(extractPickupCode('{"pickup_code":"pk-1122-aa33"}')).toBe("PK1122AA33");
    expect(extractPickupCode('{"pickupCode":"pk-4455-bb66"}')).toBe("PK4455BB66");
  });

  it("extracts code from base64 payload", () => {
    const raw = '{"pickup_code":"pk-7788-cc99"}';
    const encoded = btoa(raw);
    expect(decodeBase64Payload(encoded)).toBe(raw);
    expect(extractPickupCode(encoded)).toBe("PK7788CC99");
  });
});
