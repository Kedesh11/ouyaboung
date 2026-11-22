-- ============================================
-- Cache du secret API du fournisseur de paiement (PVIT)
-- ============================================
-- Le secret X-Secret de PVIT expire apres 3600 s et doit etre renouvele. Les
-- Edge Functions etant sans etat, le secret courant est partage via cette table
-- afin d'eviter un renouvellement a chaque requete (un renouvellement
-- concurrent pourrait invalider le secret en cours d'usage).
--
-- Securite: RLS activee SANS aucune politique et droits revoques pour les roles
-- API: seule la cle service_role (qui contourne la RLS), donc uniquement les
-- Edge Functions, peut lire ou ecrire ce secret. Il est de courte duree.

BEGIN;

CREATE TABLE IF NOT EXISTS public.payment_provider_secrets (
  provider text NOT NULL CHECK (provider IN ('pvit')),
  account_code text NOT NULL,
  secret text NOT NULL,
  expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, account_code)
);

ALTER TABLE public.payment_provider_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.payment_provider_secrets FROM anon, authenticated;

COMMENT ON TABLE public.payment_provider_secrets IS 'Secret API court (1h) du fournisseur de paiement, lisible uniquement par service_role.';

COMMIT;
