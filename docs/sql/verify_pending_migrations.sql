-- ============================================
-- Verification checklist: pending migrations (P0.2)
-- Run against the target Supabase project's SQL Editor (or `psql`) BEFORE
-- considering R1/R7 in docs/RISKS_TRACKING.md resolved in that environment.
--
-- Covers migrations:
--   20260620130000_create_order_atomic.sql
--   20260620160000_merchant_geo_rpc.sql
--   20260620190000_singpay_marketplace_payments.sql
--
-- Every query should return at least one row. An empty result means the
-- corresponding migration has not been applied to this environment yet -
-- run `supabase db push` (see supabase/README_MIGRATIONS.md) first.
-- ============================================

-- 1) Atomic reservation RPC exists (R1 - prevents stock overselling)
select proname, prosecdef as is_security_definer
from pg_proc
where proname = 'create_order_atomic';

-- 2) Geo RPC + generated column + index exist (nearby merchant search)
select proname
from pg_proc
where proname = 'nearby_available_merchants';

select column_name, data_type
from information_schema.columns
where table_name = 'merchants' and column_name = 'location';

select indexname
from pg_indexes
where tablename = 'merchants' and indexname = 'merchants_location_gist_idx';

-- 3) SingPay multi-tenant payment schema exists (R7)
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'platform_payment_wallets',
    'merchant_payout_accounts',
    'admin_payout_accounts',
    'payment_transactions',
    'payment_settlements'
  )
order by table_name;
-- Expect all 5 rows back. Missing rows point at exactly which migration
-- still needs to be applied.

-- 4) Idempotency guards on settlements are in place (double-callback safety)
select indexname, indexdef
from pg_indexes
where tablename = 'payment_settlements'
  and indexname in (
    'payment_settlements_unique_recipient_idx',
    'payment_settlements_paid_transfer_idx'
  );

-- 5) Privilege-escalation guard on profiles (security_hardening_backend)
select tgname
from pg_trigger
where tgname = 'trigger_prevent_profile_privilege_escalation';

-- 6) Admin emails are externalized, not hardcoded (externalize_admin_promotion)
select key
from platform_settings
where key = 'admin_emails';
