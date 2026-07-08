// Pure SingPay status/result mapping - no Deno/network imports - so it runs
// identically in the Edge Function and under vitest (Node).
//
// Reference: https://client.singpay.ga/doc/reference/index.html
// `transaction.status` enum: [Start, Partenaire, Terminate, Disbursement, Refund]
// `transaction.result` enum: [Success, PasswordError, BalanceError, TimeOutError, Error]

export type InternalPaymentStatus =
  | "pending"
  | "confirmed"
  | "failed"
  | "expired"
  | "cancelled"
  | "refunded";

export type LegacyTransactionStatus =
  | "PENDING"
  | "SUCCESS"
  | "FAILED"
  | "CANCELLED"
  | "TIMEOUT"
  | "REFUNDED";

export const FINAL_INTERNAL_STATUSES: readonly InternalPaymentStatus[] = [
  "confirmed",
  "failed",
  "expired",
  "cancelled",
  "refunded",
];

export const mapProviderStatus = (
  status?: string | null,
  result?: string | null
): InternalPaymentStatus => {
  // A refund is a definitive final state reported by SingPay - it takes
  // priority over `result`, which may still reflect the original payment's
  // outcome (e.g. `Success`) rather than what happened to it afterwards.
  if (status === "Refund") return "refunded";
  if (result === "Success") return "confirmed";
  if (result === "TimeOutError") return "expired";
  if (["PasswordError", "BalanceError", "Error"].includes(result || "")) return "failed";
  if (status === "Terminate" && !result) return "pending";
  if (status === "Start" || status === "Partenaire") return "pending";
  return "pending";
};

export const mapLegacyStatus = (
  internalStatus: InternalPaymentStatus | string
): LegacyTransactionStatus => {
  if (internalStatus === "confirmed") return "SUCCESS";
  if (internalStatus === "expired") return "TIMEOUT";
  if (internalStatus === "failed") return "FAILED";
  if (internalStatus === "cancelled") return "CANCELLED";
  if (internalStatus === "refunded") return "REFUNDED";
  return "PENDING";
};

export const isFinalInternalStatus = (
  internalStatus: InternalPaymentStatus | string
): boolean => FINAL_INTERNAL_STATUSES.includes(internalStatus as InternalPaymentStatus);
