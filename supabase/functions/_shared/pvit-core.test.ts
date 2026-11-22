import { describe, expect, it } from "vitest";
import {
  beneficiaryCodeFor,
  buildAck,
  buildSplitPayload,
  evaluateCallbackIp,
  extractClientIp,
  generateReference,
  hasOperatorPrefix,
  isFinalStatus,
  mapPvitStatus,
  normalizeLocalPhone,
  parseCallback,
  parseCsv,
  parsePositiveInt,
  resolveAllowedOrigin,
  parseInitiationResponse,
  parseIpList,
  parseIpMode,
  parseStatusResponse,
  sanitizeFreeInfo,
  toLegacyStatus,
  toPvitOperator,
} from "./pvit-core";

describe("phone numbers", () => {
  it("normalizes local, short and international formats to 0 + 8 digits", () => {
    expect(normalizeLocalPhone("074 11 11 11")).toBe("074111111");
    expect(normalizeLocalPhone("74111111")).toBe("074111111");
    expect(normalizeLocalPhone("+241 74 11 11 11")).toBe("074111111");
    expect(normalizeLocalPhone("24174111111")).toBe("074111111");
  });

  it("rejects anything that is not a Gabonese mobile number", () => {
    expect(normalizeLocalPhone("")).toBe("");
    expect(normalizeLocalPhone("12345")).toBe("");
    expect(normalizeLocalPhone(undefined)).toBe("");
    expect(normalizeLocalPhone(74111111)).toBe("");
  });

  it("checks the operator prefix", () => {
    expect(hasOperatorPrefix("074111111", "airtel")).toBe(true);
    expect(hasOperatorPrefix("077111111", "airtel")).toBe(true);
    expect(hasOperatorPrefix("066111111", "moov")).toBe(true);
    expect(hasOperatorPrefix("066111111", "airtel")).toBe(false);
    expect(hasOperatorPrefix("074111111", "moov")).toBe(false);
    expect(hasOperatorPrefix("74111111", "airtel")).toBe(false);
  });

  it("maps operators to PVIT codes", () => {
    expect(toPvitOperator("airtel")).toBe("AIRTEL_MONEY");
    expect(toPvitOperator("moov")).toBe("MOOV_MONEY");
  });
});

describe("generateReference", () => {
  it("is alphanumeric, uppercase and at most 20 characters (PVIT limit)", () => {
    const ref = generateReference("123e4567-e89b-12d3-a456-426614174000", 1_800_000_000_000, () => 0.5);
    expect(ref).toMatch(/^[A-Z0-9]+$/);
    expect(ref.length).toBeLessThanOrEqual(20);
    expect(ref.startsWith("OYB123E4567")).toBe(true);
  });

  it("differs between two attempts on the same order", () => {
    const a = generateReference("order-1", 1_800_000_000_000, () => 0.1);
    const b = generateReference("order-1", 1_800_000_001_000, () => 0.9);
    expect(a).not.toBe(b);
  });

  it("stays within the limit for short or odd order ids", () => {
    expect(generateReference("a-b").length).toBeLessThanOrEqual(20);
    expect(generateReference("").length).toBeLessThanOrEqual(20);
  });
});

describe("limits and beneficiary codes", () => {
  it("reads tunable limits from the environment, else the fallback", () => {
    expect(parsePositiveInt("7", 5)).toBe(7);
    for (const raw of [undefined, null, "", "0", "-3", "2.5", "abc"]) {
      expect(parsePositiveInt(raw, 5)).toBe(5);
    }
  });

  it("derives a stable alphanumeric beneficiary code", () => {
    const code = beneficiaryCodeFor("123e4567-e89b-12d3-a456-426614174000");
    expect(code).toBe("BEN123E4567E89B");
    expect(beneficiaryCodeFor("123e4567-e89b-12d3-a456-426614174000")).toBe(code);
  });
});

describe("buildSplitPayload", () => {
  const payload = buildSplitPayload({
    amount: 5000,
    reference: "OYBABCDEF1234567890",
    customerPhone: "074111111",
    operatorCode: "AIRTEL_MONEY",
    operationAccountCode: "ACC_1",
    callbackUrlCode: "CB1",
    ownerCharge: "MERCHANT",
    orderId: "order-1",
    merchantNetAmount: 4500,
    beneficiary: { msisdn: "066222222", operatorCode: "MOOV_MONEY", code: "BENX" },
  });

  it("is a fixed-amount split of the charged amount", () => {
    expect(payload).toMatchObject({
      amount: 5000,
      service: "RESTFUL",
      transaction_type: "PAYMENT",
      sharing_type: "FIXED",
      operator_code: "AIRTEL_MONEY",
      customer_account_number: "074111111",
      merchant_operation_account_code: "ACC_1",
      callback_url_code: "CB1",
      owner_charge: "MERCHANT",
    });
  });

  it("pays the shop's net amount to its Mobile Money number in local format (verified against PVIT)", () => {
    expect(payload.beneficiaries).toEqual([
      {
        destination: { kind: "MOBILE_MONEY", operator_code: "MOOV_MONEY", msisdn: "066222222", msisdn_type: "MERCHANT" },
        value: 4500,
        beneficiary_code: "BENX",
      },
    ]);
  });
});

describe("free_info", () => {
  it("keeps only letters, digits, hyphens and spaces (PVIT 422 otherwise)", () => {
    expect(sanitizeFreeInfo("order:123e4567-e89b_12d3")).toBe("order123e4567-e");
    expect(sanitizeFreeInfo("a/b\\c;d,e.f")).toBe("abcdef");
    expect(sanitizeFreeInfo("x".repeat(100)).length).toBe(15);
  });

  it("is always valid in the split payload", () => {
    const p = buildSplitPayload({
      amount: 100, reference: "R", customerPhone: "074111111", operatorCode: "AIRTEL_MONEY", operationAccountCode: "ACC",
      callbackUrlCode: "CB", ownerCharge: "MERCHANT", orderId: "123e4567-e89b-12d3-a456-426614174000", merchantNetAmount: 90,
      beneficiary: { msisdn: "074111111", operatorCode: "AIRTEL_MONEY", code: "B" },
    });
    expect(p.free_info).toMatch(/^[A-Za-z0-9 -]+$/);
    expect(p.free_info.length).toBeLessThanOrEqual(15);
    expect(p.free_info).toBe("order 123e4567");
  });
});

describe("status mapping", () => {
  it("only SUCCESS confirms and only FAILED fails", () => {
    expect(mapPvitStatus("SUCCESS")).toBe("confirmed");
    expect(mapPvitStatus(" success ")).toBe("confirmed");
    expect(mapPvitStatus("FAILED")).toBe("failed");
  });

  it("never treats PENDING, AMBIGUOUS or unknown values as final", () => {
    for (const s of ["PENDING", "AMBIGUOUS", "", null, undefined, "WHATEVER", 42]) {
      expect(mapPvitStatus(s)).toBe("pending");
    }
  });

  it("maps to legacy statuses and detects final states", () => {
    expect(toLegacyStatus("confirmed")).toBe("SUCCESS");
    expect(toLegacyStatus("failed")).toBe("FAILED");
    expect(toLegacyStatus("pending")).toBe("PENDING");
    expect(toLegacyStatus("refunded")).toBe("REFUNDED");
    expect(isFinalStatus("confirmed")).toBe(true);
    expect(isFinalStatus("pending")).toBe(false);
  });
});

describe("parseCallback / buildAck", () => {
  const sample = {
    transactionId: "PAY23102400001",
    merchantReferenceId: "REF1234567890",
    status: "SUCCESS",
    amount: 150,
    customerID: "074111111",
    fees: 3.5,
    totalAmount: 155,
    chargeOwner: "CUSTOMER",
    transactionOperation: "PAYMENT",
    code: 200,
    operator: "AIRTEL_MONEY",
    accountOperationCode: "ACC_1XXXXXXXX",
    amountCredited: 150,
  };

  it("parses the documented payload", () => {
    expect(parseCallback(sample)).toMatchObject({
      transactionId: "PAY23102400001",
      merchantReferenceId: "REF1234567890",
      status: "SUCCESS",
      amount: 150,
      fees: 3.5,
      amountCredited: 150,
      code: 200,
      transactionOperation: "PAYMENT",
    });
  });

  it("rejects payloads missing an identifier or a status", () => {
    expect(parseCallback(null)).toBeNull();
    expect(parseCallback("x")).toBeNull();
    expect(parseCallback({ ...sample, transactionId: undefined })).toBeNull();
    expect(parseCallback({ ...sample, merchantReferenceId: "" })).toBeNull();
    expect(parseCallback({ ...sample, status: undefined })).toBeNull();
  });

  it("tolerates a missing or non-numeric amount", () => {
    expect(parseCallback({ ...sample, amount: undefined })?.amount).toBeNull();
    expect(parseCallback({ ...sample, amount: "abc" })?.amount).toBeNull();
    expect(parseCallback({ ...sample, amount: "150" })?.amount).toBe(150);
  });

  it("acknowledges by echoing transactionId and code dynamically", () => {
    expect(buildAck(parseCallback(sample)!)).toEqual({ transactionId: "PAY23102400001", responseCode: 200 });
    expect(buildAck(parseCallback({ ...sample, transactionId: "PAYX", code: 201 })!)).toEqual({
      transactionId: "PAYX",
      responseCode: 201,
    });
  });
});

describe("provider response parsing", () => {
  it("parses the initiation response", () => {
    expect(
      parseInitiationResponse({
        status: "PENDING",
        status_code: "200",
        reference_id: "PAY1",
        merchant_reference_id: "REF1",
        message: "ok",
      }),
    ).toEqual({ status: "PENDING", statusCode: "200", providerTransactionId: "PAY1", merchantReferenceId: "REF1", message: "ok" });
    expect(parseInitiationResponse(null).providerTransactionId).toBeNull();
  });

  it("parses the status response", () => {
    expect(
      parseStatusResponse({
        status: "SUCCESS",
        amount: 150,
        fees: 3.5,
        merchant_reference_id: "REF1",
        operator: "AIRTEL_MONEY",
        merchant_operation_account_code: "ACC_1",
      }),
    ).toEqual({ status: "SUCCESS", amount: 150, fees: 3.5, merchantReferenceId: "REF1", operator: "AIRTEL_MONEY", accountOperationCode: "ACC_1" });
    expect(parseStatusResponse(undefined)).toMatchObject({ status: null, amount: null });
  });
});

describe("callback source (IP)", () => {
  it("trusts only the last X-Forwarded-For entry, set by the gateway", () => {
    expect(extractClientIp("1.1.1.1, 2.2.2.2, 176.31.65.18")).toBe("176.31.65.18");
    expect(extractClientIp("176.31.65.18")).toBe("176.31.65.18");
    expect(extractClientIp("")).toBeNull();
    expect(extractClientIp(null)).toBeNull();
  });

  const ALLOWLIST = ["176.31.65.18", "176.31.65.20", "176.31.65.21", "13.59.249.167"];

  it("allows the configured addresses", () => {
    for (const ip of ALLOWLIST) {
      expect(evaluateCallbackIp(ip, ALLOWLIST).allowed).toBe(true);
    }
  });

  it("allows nothing when no address is configured (fail closed)", () => {
    expect(evaluateCallbackIp("176.31.65.18", []).allowed).toBe(false);
  });

  it("does not let a client spoof an allowed address earlier in the chain", () => {
    const spoofed = "176.31.65.18, 203.0.113.9";
    expect(evaluateCallbackIp(spoofed, ALLOWLIST)).toEqual({ allowed: false, ip: "203.0.113.9" });
  });

  it("rejects unknown or missing addresses", () => {
    expect(evaluateCallbackIp("203.0.113.9", ALLOWLIST).allowed).toBe(false);
    expect(evaluateCallbackIp(null, ALLOWLIST).allowed).toBe(false);
  });

  it("parses the allowlist and the mode", () => {
    expect(parseIpList(" 1.1.1.1 , ,2.2.2.2")).toEqual(["1.1.1.1", "2.2.2.2"]);
    expect(parseIpList(undefined)).toEqual([]);
    expect(parseIpMode("enforce")).toBe("enforce");
    expect(parseIpMode("off")).toBe("off");
    expect(parseIpMode("anything")).toBe("report");
    expect(parseIpMode(undefined)).toBe("report");
    expect(parseCsv("a, b,,c")).toEqual(["a", "b", "c"]);
  });
});

describe("resolveAllowedOrigin (CORS)", () => {
  const allowed = ["https://app.example.com", "https://admin.example.com"];

  it("reflects only listed origins", () => {
    expect(resolveAllowedOrigin("https://app.example.com", allowed)).toBe("https://app.example.com");
    expect(resolveAllowedOrigin("https://evil.example.com", allowed)).toBeNull();
    expect(resolveAllowedOrigin(null, allowed)).toBeNull();
    expect(resolveAllowedOrigin("https://app.example.com.evil.io", allowed)).toBeNull();
  });

  it("allows any origin only when nothing is configured (local development)", () => {
    expect(resolveAllowedOrigin("https://anything.test", [])).toBe("*");
    expect(resolveAllowedOrigin(null, [])).toBe("*");
  });
});
