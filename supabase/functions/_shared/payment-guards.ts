// Pure payment-safety guards - no Deno/network imports - so they run
// identically in the Edge Function and under vitest (Node).

export type InternalPaymentStatus =
  | "pending"
  | "confirmed"
  | "failed"
  | "expired"
  | "cancelled"
  | "refunded";

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
// Defaults only: the Edge Functions pass the configured values
// (PAYMENT_IN_FLIGHT_WINDOW_MINUTES).
export const DEFAULT_IN_FLIGHT_WINDOW_MS = 5 * 60 * 1000;

export const inFlightWindowStart = (
  now: number = Date.now(),
  windowMs: number = DEFAULT_IN_FLIGHT_WINDOW_MS,
): string => new Date(now - windowMs).toISOString();

// Initiation rate limit per user: caps the number of payment attempts in a
// sliding window, on top of the per-order in-flight guard above.
// Defaults only: PAYMENT_INITIATION_WINDOW_MINUTES and
// PAYMENT_MAX_INITIATIONS_PER_WINDOW override them.
export const DEFAULT_INITIATION_WINDOW_MS = 10 * 60 * 1000;
export const DEFAULT_MAX_INITIATIONS_PER_WINDOW = 5;

export const initiationWindowStart = (
  now: number = Date.now(),
  windowMs: number = DEFAULT_INITIATION_WINDOW_MS,
): string => new Date(now - windowMs).toISOString();
