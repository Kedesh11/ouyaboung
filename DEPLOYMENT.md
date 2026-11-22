# Déploiement sur Vercel

Ce projet est optimisé pour un déploiement sur [Vercel](https://vercel.com).

## 1. Prérequis

- Un compte Vercel.
- Un compte Supabase (pour la base de données).
- Un repository GitHub connecté à Vercel.

## 2. Configuration Vercel

1. **Importer le projet** : Dans Vercel, cliquez sur "Add New" > "Project" et sélectionnez votre dépôt GitHub.
2. **Framework Preset** : Vercel détectera automatiquement "Next.js".
3. **Build Command** : `npm run build` (Défaut).
4. **Output Directory** : `dist` ou `.next` (Défaut).
5. **Install Command** : `npm install` (Défaut).

## 3. Configuration Supabase

Appliquez les migrations SQL du dossier `supabase/migrations` avant de valider un environnement.

Migrations critiques a verifier avant mise en production:

- `20260620130000_create_order_atomic.sql`: reservation atomique et decrement de stock transactionnel.
- `20260620160000_merchant_geo_rpc.sql`: support PostGIS pour les boutiques proches avec produits disponibles.

## 4. Variables d'Environnement

Ajoutez les variables suivantes dans **Settings > Environment Variables** sur Vercel :

| Variable | Description | Exemple |
|----------|-------------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL de votre projet Supabase | `https://xyz.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clé publique anonyme | `eyJxh...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé privée (si utilisée côté serveur) | `eyJ...` |
| `NEXT_PUBLIC_APP_URL` | URL de production de votre app | `https://oyaboug.vercel.app` |
| `ACCOUNT_CODE` | Code compte Q-Gabon Airtel | `...` |
| `ACCOUNT_CODE_MOOV` | Code compte Q-Gabon Moov, si distinct | `...` |
| `AGENT` | Identifiant agent Q-Gabon | `AG001` |
| `BEAR_TOKEN` | Token API Q-Gabon | `...` |
| `QGABON_WEBHOOK_SECRET` | Secret obligatoire pour authentifier les callbacks paiement | `...` |
| `PLATFORM_COMMISSION_RATE` | Taux de commission plateforme retenu dans le settlement | `0.10` |
| `SUPABASE_URL` | Alias serveur requis par les Edge Functions Supabase | `https://xyz.supabase.co` |
| `SUPABASE_ANON_KEY` | Alias serveur de la cle anonyme Supabase | `eyJ...` |

> [!IMPORTANT]
> Ne jamais commiter vos clés secrètes (`service_role`, `PVIT_SECRET_PASSWORD`, secrets du fournisseur de paiement) dans le code. Utilisez toujours les variables d'environnement ou un stockage de secrets serveur.

> [!NOTE]
> Le fournisseur de paiement est PVIT. Le paiement mobile est desactive cote application tant que `NEXT_PUBLIC_PAYMENT_FLOW_ENABLED` n'est pas a `true`. Le guide complet (comptes, callback, secrets, recette sandbox, mise en production) est dans `docs/PVIT_INTEGRATION.md`.

> [!CAUTION]
> Les identifiants et secrets PVIT ne doivent jamais etre transmis par le frontend: ce sont des secrets des Edge Functions (`supabase secrets set`). Le montant, la boutique, le beneficiaire et la commission sont toujours resolus cote serveur depuis la commande.

### Edge Functions de paiement

| Fonction | Role | JWT |
|----------|------|-----|
| `initiate-payment` | Initie le paiement fractionne (Airtel / Moov) | requis |
| `pvit-callback` | Webhook de statut appele par PVIT | **non** (`verify_jwt = false` dans `supabase/config.toml`) |
| `pvit-transaction-status` | Resynchronise un paiement via l'API de statut PVIT | requis |
| `verify-payout-account` | Verifie un numero de reversement par KYC | requis |

```bash
supabase functions deploy initiate-payment pvit-callback pvit-transaction-status verify-payout-account
```

`pvit-callback` doit rester deploye sans verification JWT (reglage lu dans `supabase/config.toml`); les serveurs de PVIT n'envoient pas de JWT Supabase.

## 5. CI/CD (GitHub Actions)

Un pipeline d'intégration continue est configuré dans `.github/workflows/ci.yml`.
Il s'exécute à chaque `push` ou `pull_request` sur `main` et `develop` et effectue :
- **Linting** : Vérifie la qualité du code.
- **Unit Tests** : Exécute la suite Vitest.
- **Type Checking** : Vérifie les erreurs TypeScript.
- **Build** : Vérifie que le projet compile correctement.

Si une de ces étapes échoue, le déploiement sera bloqué (si vous configurez les règles de protection de branche sur GitHub).

## 6. Sécurité (vercel.json)

Le fichier `vercel.json` à la racine configure automatiquement des en-têtes de sécurité HTTP stricts (XSS Protection, No-Sniff, etc.) et des règles de mise en cache pour les performances.
