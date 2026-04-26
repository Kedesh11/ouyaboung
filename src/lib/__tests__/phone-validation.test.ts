import {
  detectOperator,
  formatPhone,
  getAirtelPhoneError,
  getMoovPhoneError,
  normalizePhone,
  validateAirtelPhone,
  validateMoovPhone,
} from "@/lib/phone-validation";

describe("phone-validation", () => {
  it("validates Airtel prefixes", () => {
    expect(validateAirtelPhone("074123456")).toBe(true);
    expect(validateAirtelPhone("74123456")).toBe(true);
    expect(validateAirtelPhone("066123456")).toBe(false);
  });

  it("validates Moov prefixes", () => {
    expect(validateMoovPhone("066123456")).toBe(true);
    expect(validateMoovPhone("62123456")).toBe(true);
    expect(validateMoovPhone("077123456")).toBe(false);
  });

  it("detects operator correctly", () => {
    expect(detectOperator("074123456")).toBe("AIRTEL");
    expect(detectOperator("066123456")).toBe("MOOV");
    expect(detectOperator("055123456")).toBeNull();
  });

  it("normalizes valid phones", () => {
    expect(normalizePhone("74123456")).toBe("074123456");
    expect(normalizePhone("066123456")).toBe("066123456");
    expect(normalizePhone("abc")).toBeNull();
  });

  it("formats valid phone numbers", () => {
    expect(formatPhone("074123456")).toBe("074 12 34 56");
    expect(formatPhone("74123456")).toBe("074 12 34 56");
  });

  it("returns descriptive phone errors", () => {
    expect(getAirtelPhoneError("")).toContain("requis");
    expect(getAirtelPhoneError("066123456")).toContain("commencer");
    expect(getMoovPhoneError("")).toContain("requis");
    expect(getMoovPhoneError("074123456")).toContain("commencer");
  });
});
