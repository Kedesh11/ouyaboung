-- ============================================
-- Fournisseur de paiement: passage a PVIT
-- ============================================
-- Les tables de paiement (wallets, comptes de reversement, ledger, settlements)
-- sont conservees: leur modele (portefeuille plateforme + reversements aux
-- boutiques) reste valable. Seule la valeur autorisee de `provider` change.
--
-- Les contraintes sont ajoutees NOT VALID: les lignes historiques ne sont ni
-- modifiees ni revalidees (aucune perte de piste d'audit), mais toute ligne
-- inseree ou mise a jour doit desormais utiliser 'pvit'.
--
-- Consequence: les comptes de reversement existants (provider historique) ne
-- sont plus lus par l'application. Les boutiques doivent ressaisir leur numero
-- Mobile Money, qui sera verifie pour PVIT.

BEGIN;

-- platform_payment_wallets
ALTER TABLE public.platform_payment_wallets
  DROP CONSTRAINT IF EXISTS platform_payment_wallets_provider_check;
ALTER TABLE public.platform_payment_wallets
  ADD CONSTRAINT platform_payment_wallets_provider_check
  CHECK (provider IN ('pvit')) NOT VALID;
ALTER TABLE public.platform_payment_wallets
  ALTER COLUMN provider SET DEFAULT 'pvit';

-- merchant_payout_accounts
ALTER TABLE public.merchant_payout_accounts
  DROP CONSTRAINT IF EXISTS merchant_payout_accounts_provider_check;
ALTER TABLE public.merchant_payout_accounts
  ADD CONSTRAINT merchant_payout_accounts_provider_check
  CHECK (provider IN ('pvit')) NOT VALID;
ALTER TABLE public.merchant_payout_accounts
  ALTER COLUMN provider SET DEFAULT 'pvit';

-- admin_payout_accounts
ALTER TABLE public.admin_payout_accounts
  DROP CONSTRAINT IF EXISTS admin_payout_accounts_provider_check;
ALTER TABLE public.admin_payout_accounts
  ADD CONSTRAINT admin_payout_accounts_provider_check
  CHECK (provider IN ('pvit')) NOT VALID;
ALTER TABLE public.admin_payout_accounts
  ALTER COLUMN provider SET DEFAULT 'pvit';

-- payment_transactions
ALTER TABLE public.payment_transactions
  DROP CONSTRAINT IF EXISTS payment_transactions_provider_check;
ALTER TABLE public.payment_transactions
  ADD CONSTRAINT payment_transactions_provider_check
  CHECK (provider IN ('pvit')) NOT VALID;
ALTER TABLE public.payment_transactions
  ALTER COLUMN provider SET DEFAULT 'pvit';

-- Index nomme d'apres l'ancien fournisseur: un seul wallet actif par fournisseur
ALTER INDEX IF EXISTS public.platform_payment_wallets_one_active_singpay_idx
  RENAME TO platform_payment_wallets_one_active_provider_idx;

-- Commentaires sans reference a l'ancien fournisseur
COMMENT ON TABLE public.platform_payment_wallets IS 'Portefeuille principal utilise par Ouyaboung pour encaisser les paiements.';
COMMENT ON TABLE public.merchant_payout_accounts IS 'Numeros Mobile Money Airtel/Moov verifies pour reverser les boutiques.';
COMMENT ON TABLE public.admin_payout_accounts IS 'Numeros Mobile Money Airtel/Moov verifies pour les reversements plateforme/admin.';
COMMENT ON TABLE public.payment_transactions IS 'Ledger provider des paiements lies aux commandes.';
COMMENT ON TABLE public.payment_settlements IS 'Ledger idempotent des reversements apres paiement confirme.';
COMMENT ON VIEW public.merchant_transactions IS 'Vue transparente des transactions paiement incluant produit, boutique, settlement et statut de reversement.';

COMMIT;
