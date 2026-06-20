-- ============================================
-- SingPay marketplace payments
-- Wallet principal Ouyaboung + payouts dynamiques
-- ============================================

create table if not exists public.platform_payment_wallets (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'singpay' check (provider in ('singpay')),
  wallet_id text not null,
  client_id text,
  client_secret_encrypted text,
  callback_url text,
  airtel_merchant_number text,
  airtel_merchant_code_encrypted text,
  moov_merchant_number text,
  provider_metadata jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists platform_payment_wallets_one_active_singpay_idx
  on public.platform_payment_wallets (provider)
  where is_active;

create table if not exists public.merchant_payout_accounts (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  provider text not null default 'singpay' check (provider in ('singpay')),
  operator text not null check (operator in ('airtel', 'moov')),
  label text not null,
  msisdn text not null,
  normalized_msisdn text not null,
  disbursement_id text,
  verification_status text not null default 'pending'
    check (verification_status in ('pending','verified','rejected','disabled')),
  rejection_reason text,
  is_default boolean not null default false,
  is_active boolean not null default true,
  verified_by uuid references auth.users(id),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists merchant_payout_accounts_one_default_idx
  on public.merchant_payout_accounts (merchant_id, provider, operator)
  where is_default and is_active;

create unique index if not exists merchant_payout_accounts_unique_number_idx
  on public.merchant_payout_accounts (merchant_id, provider, operator, normalized_msisdn)
  where is_active;

create index if not exists merchant_payout_accounts_merchant_idx
  on public.merchant_payout_accounts (merchant_id, verification_status, is_active);

create table if not exists public.admin_payout_accounts (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'singpay' check (provider in ('singpay')),
  operator text not null check (operator in ('airtel', 'moov')),
  label text not null,
  msisdn text not null,
  normalized_msisdn text not null,
  disbursement_id text,
  verification_status text not null default 'pending'
    check (verification_status in ('pending','verified','rejected','disabled')),
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  verified_by uuid references auth.users(id),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists admin_payout_accounts_one_default_idx
  on public.admin_payout_accounts (provider, operator)
  where is_default and is_active;

create table if not exists public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  food_item_id uuid references public.food_items(id) on delete set null,
  merchant_id uuid not null references public.merchants(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  legacy_transaction_id uuid references public.transactions(id) on delete set null,
  platform_wallet_id uuid not null references public.platform_payment_wallets(id) on delete restrict,
  provider text not null default 'singpay' check (provider in ('singpay')),
  operator text not null check (operator in ('airtel','moov','maviance','external')),
  internal_reference text not null unique,
  provider_transaction_id text,
  provider_status text,
  provider_result text,
  status text not null default 'initiated'
    check (status in ('initiated','pending','confirmed','failed','cancelled','expired','refunded')),
  amount integer not null,
  currency text not null default 'XAF',
  raw_request jsonb,
  raw_response jsonb,
  raw_callback jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz
);

create index if not exists payment_transactions_order_idx
  on public.payment_transactions (order_id, created_at desc);

create index if not exists payment_transactions_merchant_idx
  on public.payment_transactions (merchant_id, created_at desc);

create index if not exists payment_transactions_provider_tx_idx
  on public.payment_transactions (provider_transaction_id)
  where provider_transaction_id is not null;

create table if not exists public.payment_settlements (
  id uuid primary key default gen_random_uuid(),
  payment_transaction_id uuid not null references public.payment_transactions(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  merchant_id uuid references public.merchants(id) on delete restrict,
  recipient_type text not null check (recipient_type in ('merchant','platform')),
  merchant_payout_account_id uuid references public.merchant_payout_accounts(id) on delete restrict,
  admin_payout_account_id uuid references public.admin_payout_accounts(id) on delete restrict,
  disbursement_id text,
  gross_amount integer not null,
  fee_amount integer not null default 0,
  net_amount integer not null,
  currency text not null default 'XAF',
  status text not null default 'pending'
    check (status in ('pending','ready','processing','paid','failed','cancelled','manual_review')),
  provider_transfer_reference text,
  provider_transfer_status text,
  raw_transfer_request jsonb,
  raw_transfer_response jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz
);

create unique index if not exists payment_settlements_unique_recipient_idx
  on public.payment_settlements (
    payment_transaction_id,
    recipient_type,
    coalesce(merchant_payout_account_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(admin_payout_account_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

create unique index if not exists payment_settlements_paid_transfer_idx
  on public.payment_settlements (payment_transaction_id, disbursement_id, net_amount)
  where status = 'paid' and disbursement_id is not null;

alter table public.transactions
  add column if not exists provider text default 'qgabon',
  add column if not exists payment_transaction_id uuid references public.payment_transactions(id) on delete set null,
  add column if not exists provider_status text,
  add column if not exists provider_result text,
  add column if not exists settlement_status text;

drop trigger if exists set_platform_payment_wallets_updated_at on public.platform_payment_wallets;
create trigger set_platform_payment_wallets_updated_at
  before update on public.platform_payment_wallets
  for each row
  execute procedure public.set_updated_at();

drop trigger if exists set_merchant_payout_accounts_updated_at on public.merchant_payout_accounts;
create trigger set_merchant_payout_accounts_updated_at
  before update on public.merchant_payout_accounts
  for each row
  execute procedure public.set_updated_at();

drop trigger if exists set_admin_payout_accounts_updated_at on public.admin_payout_accounts;
create trigger set_admin_payout_accounts_updated_at
  before update on public.admin_payout_accounts
  for each row
  execute procedure public.set_updated_at();

drop trigger if exists set_payment_transactions_updated_at on public.payment_transactions;
create trigger set_payment_transactions_updated_at
  before update on public.payment_transactions
  for each row
  execute procedure public.set_updated_at();

drop trigger if exists set_payment_settlements_updated_at on public.payment_settlements;
create trigger set_payment_settlements_updated_at
  before update on public.payment_settlements
  for each row
  execute procedure public.set_updated_at();

alter table public.platform_payment_wallets enable row level security;
alter table public.merchant_payout_accounts enable row level security;
alter table public.admin_payout_accounts enable row level security;
alter table public.payment_transactions enable row level security;
alter table public.payment_settlements enable row level security;

create policy "Admins can manage platform wallets"
  on public.platform_payment_wallets for all
  using (exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin'));

create policy "Merchants can read own payout accounts"
  on public.merchant_payout_accounts for select
  using (
    exists (
      select 1 from public.merchants m
      where m.id = merchant_payout_accounts.merchant_id
      and m.user_id = auth.uid()
    )
  );

create policy "Merchants can propose own payout accounts"
  on public.merchant_payout_accounts for insert
  with check (
    exists (
      select 1 from public.merchants m
      where m.id = merchant_payout_accounts.merchant_id
      and m.user_id = auth.uid()
    )
    and verification_status = 'pending'
    and disbursement_id is null
  );

create policy "Admins can manage merchant payout accounts"
  on public.merchant_payout_accounts for all
  using (exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin'));

create policy "Admins can manage admin payout accounts"
  on public.admin_payout_accounts for all
  using (exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin'));

create policy "Users can read own payment transactions"
  on public.payment_transactions for select
  using (auth.uid() = user_id);

create policy "Merchants can read own payment transactions"
  on public.payment_transactions for select
  using (
    exists (
      select 1 from public.merchants m
      where m.id = payment_transactions.merchant_id
      and m.user_id = auth.uid()
    )
  );

create policy "Admins can read all payment transactions"
  on public.payment_transactions for select
  using (exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin'));

create policy "Users can read own payment settlements"
  on public.payment_settlements for select
  using (
    exists (
      select 1 from public.payment_transactions pt
      where pt.id = payment_settlements.payment_transaction_id
      and pt.user_id = auth.uid()
    )
  );

create policy "Merchants can read own payment settlements"
  on public.payment_settlements for select
  using (
    exists (
      select 1 from public.merchants m
      where m.id = payment_settlements.merchant_id
      and m.user_id = auth.uid()
    )
  );

create policy "Admins can read all payment settlements"
  on public.payment_settlements for select
  using (exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin'));

comment on table public.platform_payment_wallets is 'SingPay wallet principal utilise par Ouyaboung pour encaisser les paiements.';
comment on table public.merchant_payout_accounts is 'Numeros Mobile Money Airtel/Moov verifies pour reverser les boutiques.';
comment on table public.admin_payout_accounts is 'Numeros Mobile Money Airtel/Moov verifies pour les reversements plateforme/admin.';
comment on table public.payment_transactions is 'Ledger provider des paiements SingPay lies aux commandes.';
comment on table public.payment_settlements is 'Ledger idempotent des reversements dynamiques apres paiement confirme.';

drop view if exists public.merchant_transactions;

create view public.merchant_transactions as
select
  t.id as transaction_id,
  t.created_at as transaction_date,
  t.status as payment_status,
  t.reference as q_gabon_reference,
  t.reference as provider_reference,
  coalesce(t.provider, 'qgabon') as provider,

  t.amount as base_amount,
  t.airtel_fees,
  t.pvit_fees,
  t.app_fees,
  t.total_amount,
  coalesce(ps.net_amount, t.amount_credited, t.total_amount - coalesce(ps.fee_amount, 0), t.total_amount) as merchant_revenue,
  coalesce(ps.fee_amount, t.fees, 0) as q_gabon_fees,
  coalesce(ps.fee_amount, 0) as platform_commission,
  ps.status as settlement_status,
  ps.disbursement_id,
  ps.provider_transfer_reference,
  ps.provider_transfer_status,

  t.customer_id as payment_phone_number,
  t.operator_owner_charge,
  t.transaction_id as q_gabon_transaction_id,
  t.transaction_id as provider_transaction_id,
  t.merchant_reference_id,
  t.operator,
  t.operator_fees,
  t.status_code,
  t.message,
  t.provider_status,
  t.provider_result,

  o.id as order_id,
  o.quantity as order_quantity,
  o.status as order_status,
  o.pickup_code,
  o.consumed_at,
  o.consumed_by,

  f.id as product_id,
  f.name as product_name,
  f.category as product_category,
  f.original_price,
  f.discounted_price,

  m.id as merchant_id,
  m.business_name as merchant_name,
  m.business_type,

  u.id as customer_id,
  p.full_name as customer_name,
  p.email as customer_email,
  t.phone as customer_phone
from public.transactions t
join public.orders o on t.order_id = o.id
join public.food_items f on o.food_item_id = f.id
join public.merchants m on t.merchant_id = m.id
join auth.users u on t.user_id = u.id
left join public.profiles p on p.user_id = u.id
left join public.payment_transactions pt on pt.id = t.payment_transaction_id
left join public.payment_settlements ps
  on ps.payment_transaction_id = pt.id
  and ps.recipient_type = 'merchant';

grant select on public.merchant_transactions to authenticated;

comment on view public.merchant_transactions is 'Vue transparente des transactions paiement incluant SingPay, produit, boutique, settlement et statut de reversement.';
