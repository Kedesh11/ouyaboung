-- ============================================
-- Vue Commerce - Transactions Détaillées
-- Permet à chaque commerce d'avoir une vue complète de ses transactions
-- ============================================

-- Vue dédiée pour visualiser toutes les transactions par commerce
create or replace view public.merchant_transactions as
select
  -- Transaction
  t.id as transaction_id,
  t.created_at as transaction_date,
  t.status as payment_status,
  t.reference as q_gabon_reference,
  
  -- Montants
  t.amount as base_amount,
  t.airtel_fees,
  t.pvit_fees,
  t.app_fees,
  t.total_amount,
  t.amount_credited as merchant_revenue,
  
  -- Q-Gabon infos
  t.transaction_id as q_gabon_transaction_id,
  t.merchant_reference_id,
  t.operator,
  t.operator_fees,
  t.status_code,
  t.message,
  
  -- Order details
  o.id as order_id,
  o.quantity as order_quantity,
  o.status as order_status,
  o.pickup_code,
  
  -- Product details
  f.id as product_id,
  f.name as product_name,
  f.category as product_category,
  f.original_price,
  f.discounted_price,
  
  -- Merchant details
  m.id as merchant_id,
  m.business_name as merchant_name,
  m.business_type,
  
  -- Customer details
  u.id as customer_id,
  p.full_name as customer_name,
  p.email as customer_email,
  t.phone as customer_phone

from public.transactions t
join public.orders o on t.order_id = o.id
join public.food_items f on o.food_item_id = f.id
join public.merchants m on t.merchant_id = m.id
join auth.users u on t.user_id = u.id
left join public.profiles p on p.user_id = u.id;

-- Grant select permission aux utilisateurs authentifiés
grant select on public.merchant_transactions to authenticated;

-- RLS policies appliquées via la table transactions sous-jacente
comment on view public.merchant_transactions is 
'Vue détaillée des transactions par commerce avec traçabilité complète produit → commande → paiement';
