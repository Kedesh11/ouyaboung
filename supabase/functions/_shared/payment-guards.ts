// Pure payment-safety guards - no Deno/network imports - so they run
// identically in the Edge Function and under vitest (Node).

import type { InternalPaymentStatus } from "./singpay-status.ts";

const FINAL_STATUSES: readonly string[] = [
  "confirmed",
  "failed",
  "expired",
  "cancelled",
  "refunded",
];

// A provider callback can be replayed, delayed or delivered out of order.
// Final states are sticky: the only legal move out of one is a refund of a
// confirmed payment. Everything else (e.g. a late `failed` after `confirmed`,
// or `pending` after anything final) must be ignored.
export const canTransitionPaymentStatus = (
  current: InternalPaymentStatus | string | null | undefined,
  next: InternalPaymentStatus | string,
): boolean => {
  if (!current || !FINAL_STATUSES.includes(current)) return true;
  if (current === next) return true;
  return current === "confirmed" && next === "refunded";
};

// Amounts are whole XAF. A provider payload without an amount can't be
// verified, so it is accepted; a present amount must match exactly.
export const isReportedAmountValid = (
  expected: number,
  reported: number | null | undefined,
): boolean => {
  if (reported === null || reported === undefined) return true;
  if (!Number.isFinite(reported) || reported <= 0) return true;
  return Math.round(reported) === Math.round(expected);
};

// Window during which an initiated/pending payment for the same order is
// considered still awaiting the customer's phone confirmation.
export const IN_FLIGHT_PAYMENT_WINDOW_MS = 5 * 60 * 1000;

export const inFlightWindowStart = (now: number = Date.now()): string =>
  new Date(now - IN_FLIGHT_PAYMENT_WINDOW_MS).toISOString();
