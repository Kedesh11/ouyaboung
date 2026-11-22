// Pure PVIT helpers - no Deno/network imports - so they run identically in the
// Edge Functions and under vitest (Node).
//
// Reference: https://docs.mypvit.pro/fr (paiement, paiement fractionne, statut,
// webhooks, KYC). Statuses: PENDING | SUCCESS | FAILED | AMBIGUOUS.

import type { InternalPaymentStatus } from "./payment-guards.ts";

export type Operator = "airtel" | "moov";
export type PvitOperatorCode = "AIRTEL_MONEY" | "MOOV_MONEY";

// ---------------------------------------------------------------- phone numbers

const AIRTEL_LOCAL_PREFIXES = ["74", "77", "76"];
const MOOV_LOCAL_PREFIXES = ["66", "62", "65"];

// Local format with leading zero: 0 + 8 digits (e.g. 074111111).
export const normalizeLocalPhone = (raw: unknown): string => {
  if (typeof raw !== "string") return "";
  let cleaned = raw.replace(/\D/g, "");
  if (cleaned.startsWith("241") && cleaned.length === 11) cleaned = `0${cleaned.slice(3)}`;
  if (cleaned.length === 8) cleaned = `0${cleaned}`;
  return /^0\d{8}$/.test(cleaned) ? cleaned : "";
};

export const hasOperatorPrefix = (localPhone: string, operator: Operator): boolean => {
  if (!/^0\d{8}$/.test(localPhone)) return false;
  const local = localPhone.slice(1);
  const prefixes = operator === "airtel" ? AIRTEL_LOCAL_PREFIXES : MOOV_LOCAL_PREFIXES;
  return prefixes.some((p) => local.startsWith(p));
};

export const toPvitOperator = (operator: Operator): PvitOperatorCode =>
  operator === "airtel" ? "AIRTEL_MONEY" : "MOOV_MONEY";

export const phoneValidationMessage = (operator: Operator): string =>
  operator === "airtel"
    ? "Numero Airtel invalide. Prefixes acceptes: 74, 77, 76."
    : "Numero Libertis/Moov invalide. Prefixes acceptes: 66, 62, 65.";

// ------------------------------------------------------------------- reference

// PVIT references are alphanumeric, unique, max 20 characters, and guarantee
// idempotency. OYB (3) + 8 hex of the order id + 8 base36 time chars = 19.
export const generateReference = (
  orderId: string,
  now: number = Date.now(),
  random: () => number = Math.random,
): string => {
  const orderPart = orderId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toUpperCase().padEnd(8, "0");
  const timePart = now.toString(36).toUpperCase().slice(-6).padStart(6, "0");
  const randPart = Math.floor(random() * 36 ** 2).toString(36).toUpperCase().padStart(2, "0");
  return `OYB${orderPart}${timePart}${randPart}`.slice(0, 20);
};

// -------------------------------------------------------------- commission/split

// The commission is business configuration (PLATFORM_COMMISSION_RATE): there is
// no silent default. A missing or invalid value returns null so the caller can
// refuse to take payments instead of charging an unintended rate.
export const parseCommissionRate = (raw: string | undefined | null): number | null => {
  if (raw === undefined || raw === null || raw.trim() === "") return null;
  const rate = Number(raw);
  return Number.isFinite(rate) && rate >= 0 && rate < 1 ? rate : null;
};

// Tunable limits: a positive integer from the environment, else the fallback.
export const parsePositiveInt = (raw: string | undefined | null, fallback: number): number => {
  const n = Number(raw ?? "");
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

// Whole XAF: the platform keeps the rounded commission, the shop gets the rest.
// The sum is exactly the amount charged, so no money is created or lost.
export const computeSplit = (amount: number, rate: number) => {
  const feeAmount = Math.round(amount * rate);
  return { feeAmount, merchantNetAmount: amount - feeAmount };
};

// Short, stable, alphanumeric beneficiary code derived from the payout account.
export const beneficiaryCodeFor = (payoutAccountId: string): string =>
  `BEN${payoutAccountId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12).toUpperCase()}`;

export type SplitPaymentInput = {
  amount: number;
  reference: string;
  customerPhone: string; // local, 0 + 8 digits
  operatorCode: PvitOperatorCode;
  operationAccountCode: string;
  callbackUrlCode: string;
  ownerCharge: "CUSTOMER" | "MERCHANT";
  orderId: string;
  merchantNetAmount: number;
  beneficiary: { msisdn: string; operatorCode: PvitOperatorCode; code: string }; // msisdn: local
};

// free_info: only letters, digits, hyphens and spaces, at most 15 characters
// (422 CONSTRAINT_VIOLATION otherwise, both verified against the sandbox).
export const FREE_INFO_MAX_LENGTH = 15;

export const sanitizeFreeInfo = (value: string): string =>
  value.replace(/[^A-Za-z0-9 -]/g, "").slice(0, FREE_INFO_MAX_LENGTH);

// The shop receives a FIXED amount (XAF); the commission stays on the platform
// operation account. FIXED avoids percentage rounding on the shop's share.
export const buildSplitPayload = (i: SplitPaymentInput) => ({
  amount: i.amount,
  reference: i.reference,
  service: "RESTFUL",
  transaction_type: "PAYMENT",
  operator_code: i.operatorCode,
  customer_account_number: i.customerPhone,
  merchant_operation_account_code: i.operationAccountCode,
  callback_url_code: i.callbackUrlCode,
  owner_charge: i.ownerCharge,
  owner_charge_operator: i.ownerCharge,
  free_info: sanitizeFreeInfo(`order ${i.orderId.replace(/[^A-Za-z0-9]/g, "").slice(0, 8)}`),
  sharing_type: "FIXED",
  beneficiaries: [
    {
      destination: {
        kind: "MOBILE_MONEY",
        operator_code: i.beneficiary.operatorCode,
        // Local format with the leading zero (e.g. 077123456). The international
        // form shown in PVIT's example is rejected by the API (3032), verified
        // against the sandbox.
        msisdn: i.beneficiary.msisdn,
        msisdn_type: "MERCHANT",
      },
      value: i.merchantNetAmount,
      beneficiary_code: i.beneficiary.code,
    },
  ],
});

// ----------------------------------------------------------------------- status

// PENDING and AMBIGUOUS are never final: an ambiguous status must be re-checked.
export const mapPvitStatus = (status: unknown): InternalPaymentStatus => {
  const s = typeof status === "string" ? status.trim().toUpperCase() : "";
  if (s === "SUCCESS") return "confirmed";
  if (s === "FAILED") return "failed";
  return "pending";
};

export type LegacyTransactionStatus = "PENDING" | "SUCCESS" | "FAILED" | "CANCELLED" | "TIMEOUT" | "REFUNDED";

export const toLegacyStatus = (internal: InternalPaymentStatus | string): LegacyTransactionStatus => {
  if (internal === "confirmed") return "SUCCESS";
  if (internal === "failed") return "FAILED";
  if (internal === "expired") return "TIMEOUT";
  if (internal === "cancelled") return "CANCELLED";
  if (internal === "refunded") return "REFUNDED";
  return "PENDING";
};

export const isFinalStatus = (internal: string): boolean =>
  ["confirmed", "failed", "expired", "cancelled", "refunded"].includes(internal);

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

// ------------------------------------------------------------- webhook callback

export type PvitCallback = {
  transactionId: string;
  merchantReferenceId: string;
  status: string;
  amount: number | null;
  fees: number | null;
  amountCredited: number | null;
  code: number | string | null;
  operator: string | null;
  accountOperationCode: string | null;
  transactionOperation: string | null;
};

export const parseCallback = (payload: unknown): PvitCallback | null => {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  const transactionId = str(p.transactionId);
  const merchantReferenceId = str(p.merchantReferenceId);
  const status = str(p.status);
  if (!transactionId || !merchantReferenceId || !status) return null;
  return {
    transactionId,
    merchantReferenceId,
    status,
    amount: num(p.amount),
    fees: num(p.fees),
    amountCredited: num(p.amountCredited),
    code: typeof p.code === "number" || typeof p.code === "string" ? p.code : null,
    operator: str(p.operator),
    accountOperationCode: str(p.accountOperationCode),
    transactionOperation: str(p.transactionOperation),
  };
};

// PVIT requires a dynamic echo of transactionId and code (never hard-coded).
export const buildAck = (cb: Pick<PvitCallback, "transactionId" | "code">) => ({
  transactionId: cb.transactionId,
  responseCode: cb.code,
});

export type PvitStatusResult = {
  status: string | null;
  amount: number | null;
  fees: number | null;
  merchantReferenceId: string | null;
  operator: string | null;
  accountOperationCode: string | null;
};

export const parseStatusResponse = (payload: unknown): PvitStatusResult => {
  const p = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  return {
    status: str(p.status),
    amount: num(p.amount),
    fees: num(p.fees),
    merchantReferenceId: str(p.merchant_reference_id),
    operator: str(p.operator),
    accountOperationCode: str(p.merchant_operation_account_code),
  };
};

export const parseInitiationResponse = (payload: unknown) => {
  const p = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  return {
    status: str(p.status),
    statusCode: str(p.status_code) ?? (typeof p.status_code === "number" ? String(p.status_code) : null),
    providerTransactionId: str(p.reference_id),
    merchantReferenceId: str(p.merchant_reference_id),
    message: str(p.message),
  };
};

// -------------------------------------------------------------- callback source

// PVIT does not sign webhooks: the source can only be restricted by IP. The
// addresses PVIT publishes are configuration (PVIT_CALLBACK_ALLOWED_IPS), not
// code: they can change without a redeploy of the source.
export const parseCsv = (raw: string | undefined | null): string[] =>
  (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

export const parseIpList = parseCsv;

// CORS: reflect the request origin only when it is in ALLOWED_ORIGINS. With no
// list configured, any origin is allowed (local development).
export const resolveAllowedOrigin = (origin: string | null | undefined, allowed: string[]): string | null => {
  if (allowed.length === 0) return "*";
  return origin && allowed.includes(origin) ? origin : null;
};

// The edge gateway appends the connecting address to X-Forwarded-For, so the
// last entry is the one set by trusted infrastructure; earlier ones are
// client-controlled and must not be trusted.
export const extractClientIp = (forwardedFor: string | null | undefined): string | null => {
  const parts = (forwardedFor ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : null;
};

export type IpMode = "enforce" | "report" | "off";

export const parseIpMode = (raw: string | undefined | null): IpMode =>
  raw === "enforce" || raw === "off" ? raw : "report";

export const evaluateCallbackIp = (
  forwardedFor: string | null | undefined,
  allowlist: string[],
): { allowed: boolean; ip: string | null } => {
  const ip = extractClientIp(forwardedFor);
  return { allowed: ip !== null && allowlist.includes(ip), ip };
};
