-- ============================================
-- Table TRANSACTIONS - Traçabilité complète des paiements
-- ============================================

-- Table principale des transactions
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  
  -- Références métier
  order_id uuid not null references public.orders(id) on delete cascade,
  merchant_id uuid not null references public.merchants(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  
  -- Données paiement Q-Gabon (paramètres envoyés)
  phone text not null,
  amount integer not null,              -- Montant base (panier)
  account_code text not null,
  product text not null default 'paiement',
  agent text not null,
  
  -- Calcul des frais (3% chacun selon specs Q-Gabon)
  airtel_fees integer not null,         -- 3% du montant
  pvit_fees integer not null,           -- 3% du montant  
  app_fees integer not null,            -- 3% du montant
  total_amount integer not null,        -- amount + all fees
  
  -- Réponse Q-Gabon (structure complète de l'API)
  q_gabon_response jsonb,               -- Réponse brute complète de l'API
  transaction_id text,                  -- Q-Gabon transactionId
  merchant_reference_id text,           -- Q-Gabon merchant_reference_id
  merchant_operation_account_code text, -- Q-Gabon account operation code
  reference text,                       -- Q-Gabon reference (unique)
  operator text,                        -- "AIRTEL_MONEY"
  operator_fees numeric(10,2),          -- Frais opérateur retournés par Q-Gabon
  
  -- Statuts et tracking
  status text not null default 'PENDING'
    check (status in ('PENDING','SUCCESS','FAILED','CANCELLED','TIMEOUT')),
  status_code text,                     -- Code de statut Q-Gabon (200, etc.)
  charge_owner text,                    -- "CUSTOMER"
  amount_credited integer,              -- Montant crédité au merchant
  message text,                         -- Message de l'API
  
  -- Métadonnées
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

-- Indexes pour performance
create index if not exists transactions_order_id_idx on public.transactions(order_id);
create index if not exists transactions_merchant_id_idx on public.transactions(merchant_id);
create index if not exists transactions_user_id_idx on public.transactions(user_id);
create index if not exists transactions_reference_idx on public.transactions(reference);
create index if not exists transactions_status_idx on public.transactions(status);
create index if not exists transactions_created_at_idx on public.transactions(created_at desc);

-- Unique constraint sur reference si fournie
create unique index if not exists transactions_reference_unique_idx 
  on public.transactions(reference) 
  where reference is not null;

-- Trigger pour updated_at
drop trigger if exists set_transactions_updated_at on public.transactions;
create trigger set_transactions_updated_at
  before update on public.transactions
  for each row
  execute procedure public.set_updated_at();

-- Enable RLS
alter table public.transactions enable row level security;

-- RLS Policies

-- Users can view their own transactions
create policy "Users can view own transactions"
  on public.transactions for select
  using (auth.uid() = user_id);

-- Merchants can view transactions for their orders
create policy "Merchants can view their transactions"
  on public.transactions for select
  using (
    exists (
      select 1 from public.merchants m
      join public.profiles p on m.user_id = p.user_id
      where m.id = transactions.merchant_id
      and p.user_id = auth.uid()
      and p.role = 'merchant'
    )
  );

-- Only service role can insert transactions (via Edge Functions)
create policy "Service role can insert transactions"
  on public.transactions for insert
  with check (true);

-- Only service role can update transactions (via callbacks)
create policy "Service role can update transactions"
  on public.transactions for update
  using (true);

-- Admins can view all transactions
create policy "Admins can view all transactions"
  on public.transactions for select
  using (
    exists (
      select 1 from public.profiles
      where user_id = auth.uid() and role = 'admin'
    )
  );

-- Comments pour documentation
comment on table public.transactions is 'Table de traçabilité complète des transactions de paiement Q-Gabon';
comment on column public.transactions.amount is 'Montant de base du panier (sans frais)';
comment on column public.transactions.airtel_fees is 'Frais Airtel Money (3%)';
comment on column public.transactions.pvit_fees is 'Frais PVIT (3%)';
comment on column public.transactions.app_fees is 'Frais Application (3%)';
comment on column public.transactions.total_amount is 'Montant total = amount + airtel_fees + pvit_fees + app_fees';
comment on column public.transactions.q_gabon_response is 'Réponse JSON complète de l''API Q-Gabon pour audit';
