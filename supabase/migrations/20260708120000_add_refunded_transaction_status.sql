-- ==========================================
-- Allow REFUNDED on the legacy transactions table
-- Date: 2026-07-08
--
-- SingPay's transaction.status enum includes "Refund" (see
-- https://client.singpay.ga/doc/reference/index.html), but the callback
-- handler only ever produced PENDING/SUCCESS/FAILED/CANCELLED/TIMEOUT for
-- this table, silently leaving refunded payments stuck as PENDING.
-- payment_transactions.status already allows 'refunded' (see
-- 20260620190000_singpay_marketplace_payments.sql) - this migration brings
-- the legacy table's constraint in line with it.
-- ==========================================

BEGIN;

ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_status_check;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_status_check
  CHECK (status IN ('PENDING', 'SUCCESS', 'FAILED', 'CANCELLED', 'TIMEOUT', 'REFUNDED'));

COMMIT;
