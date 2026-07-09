-- ============================================
-- Allow bulk role-change / user-deletion activity types
-- Date: 2026-07-09
--
-- admin_activities.type had a closed CHECK constraint that didn't allow
-- logging bulk admin actions properly (the existing single-user role
-- route worked around this with a 'test_activity' placeholder). Adds
-- 'role_changed' and 'user_deleted' without removing any existing value.
-- ============================================

BEGIN;

ALTER TABLE public.admin_activities DROP CONSTRAINT IF EXISTS valid_activity_type;

ALTER TABLE public.admin_activities ADD CONSTRAINT valid_activity_type
  CHECK (type IN (
    'merchant_registration',
    'merchant_validated',
    'merchant_refused',
    'sale_completed',
    'product_added',
    'test_activity',
    'role_changed',
    'user_deleted'
  ));

COMMIT;
