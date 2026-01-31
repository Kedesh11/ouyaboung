-- ============================================
-- Migration: Update merchant_transactions view
-- Date: 2026-01-31
-- Description: Add new Q-Gabon callback fields for complete transaction audit
-- 
-- Changes:
-- - Added: q_gabon_fees (total fees from Q-Gabon)
-- - Added: payment_phone_number (customer_id from Q-Gabon callback)
-- - Added: operator_owner_charge (who pays operator fees)
-- - Added: consumed_at, consumed_by (QR code validation fields)
-- 
-- Dependencies: 
-- - Requires tables: transactions, orders, food_items, merchants, profiles
-- - Requires columns: transactions.fees, transactions.customer_id, transactions.operator_owner_charge
-- - Requires columns: orders.consumed_at, orders.consumed_by
-- ============================================

-- Drop existing view to ensure clean recreation
DROP VIEW IF EXISTS public.merchant_transactions;

-- Recreate view with all fields
CREATE VIEW public.merchant_transactions AS
SELECT
  -- === TRANSACTION CORE ===
  t.id AS transaction_id,
  t.created_at AS transaction_date,
  t.status AS payment_status,
  t.reference AS q_gabon_reference,
  
  -- === AMOUNTS (Application calculated) ===
  t.amount AS base_amount,
  t.airtel_fees,
  t.pvit_fees,
  t.app_fees,
  t.total_amount,
  t.amount_credited AS merchant_revenue,
  
  -- === Q-GABON CALLBACK DATA (New fields) ===
  t.fees AS q_gabon_fees,
  t.customer_id AS payment_phone_number,
  t.operator_owner_charge,
  
  -- === Q-GABON TECHNICAL INFO ===
  t.transaction_id AS q_gabon_transaction_id,
  t.merchant_reference_id,
  t.operator,
  t.operator_fees,
  t.status_code,
  t.message,
  
  -- === ORDER DETAILS ===
  o.id AS order_id,
  o.quantity AS order_quantity,
  o.status AS order_status,
  o.pickup_code,
  o.consumed_at,
  o.consumed_by,
  
  -- === PRODUCT DETAILS ===
  f.id AS product_id,
  f.name AS product_name,
  f.category AS product_category,
  f.original_price,
  f.discounted_price,
  
  -- === MERCHANT DETAILS ===
  m.id AS merchant_id,
  m.business_name AS merchant_name,
  m.business_type,
  
  -- === CUSTOMER DETAILS ===
  u.id AS customer_id,
  p.full_name AS customer_name,
  p.email AS customer_email,
  t.phone AS customer_phone

FROM public.transactions t
  INNER JOIN public.orders o ON t.order_id = o.id
  INNER JOIN public.food_items f ON o.food_item_id = f.id
  INNER JOIN public.merchants m ON t.merchant_id = m.id
  INNER JOIN auth.users u ON t.user_id = u.id
  LEFT JOIN public.profiles p ON p.user_id = u.id;

-- Grant permissions
GRANT SELECT ON public.merchant_transactions TO authenticated;

-- Add documentation
COMMENT ON VIEW public.merchant_transactions IS 'Detailed transaction view with complete Q-Gabon callback data for audit. Includes payment amounts, fees breakdown, order status, and QR validation fields. Updated: 2026-01-31 to include fees, payment_phone_number, operator_owner_charge, consumed_at/by';

-- Verify view was created successfully
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.views 
    WHERE table_schema = 'public' 
    AND table_name = 'merchant_transactions'
  ) THEN
    RAISE EXCEPTION 'View merchant_transactions was not created successfully';
  END IF;
END $$;
