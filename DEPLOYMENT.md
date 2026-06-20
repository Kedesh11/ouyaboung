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
| `SINGPAY_BASE_URL` | URL API SingPay cible pour le futur paiement marketplace | `https://gateway.singpay.ga/v1` |
| `SINGPAY_PLATFORM_WALLET_ID` | Wallet ID du portefeuille principal Ouyaboung | `68887e...` |
| `SINGPAY_CLIENT_ID` | Client ID SingPay du portefeuille principal | `...` |
| `SINGPAY_CLIENT_SECRET` | Secret SingPay du portefeuille principal | `...` |
| `SINGPAY_CALLBACK_SECRET` | Secret serveur a definir si SingPay fournit un mecanisme de signature callback | `...` |
| `SINGPAY_TRANSFERS_ENABLED` | Garde-fou pour activer les reversements `POST /transfer` apres validation | `false` |
| `SINGPAY_REQUIRE_VERIFIED_PAYOUT` | Bloque le paiement si la boutique n'a pas de payout verifie | `true` |
| `SINGPAY_PAYMENT_DISBURSEMENT_MODE` | Mode d'envoi du champ `disbursement` au paiement initial | `deferred` |
| `PLATFORM_COMMISSION_RATE` | Taux de commission plateforme retenu dans le settlement | `0.10` |
| `SUPABASE_URL` | Alias serveur requis par les Edge Functions Supabase | `https://xyz.supabase.co` |
| `SUPABASE_ANON_KEY` | Alias serveur de la cle anonyme Supabase | `eyJ...` |

> [!IMPORTANT]
> Ne jamais commiter vos clés secrètes (`service_role`, `BEAR_TOKEN`, `QGABON_WEBHOOK_SECRET`, `SINGPAY_CLIENT_SECRET`, secrets SingPay) dans le code. Utilisez toujours les variables d'environnement ou un stockage de secrets serveur.

> [!WARNING]
> `ALLOW_INSECURE_WEBHOOKS=true` est reserve au developpement local. En production, laissez cette variable absente ou a `false` et configurez toujours `QGABON_WEBHOOK_SECRET`.

> [!NOTE]
> Le paiement actuel reste base sur une configuration Q-Gabon plateforme globale. Le modele cible SingPay utilise un wallet principal Ouyaboung, puis des reversements dynamiques vers les numeros Airtel/Moov verifies des boutiques et de l'admin. Voir `docs/PAYMENT_MULTI_TENANT_ARCHITECTURE.md` et `docs/SINGPAY_SWAGGER_ANALYSIS.md` avant toute evolution du paiement.

> [!CAUTION]
> Les futurs `x-client-id`, `x-client-secret`, `x-wallet` et `Disbursement ID` SingPay ne doivent pas etre transmis par le frontend. Ils devront etre resolus cote serveur depuis le wallet principal, la commande, la boutique et les comptes payout verifies.

Edge Functions paiement a deployer:

- `initiate-airtel`
- `initiate-moov`
- `initiate-payment`
- `payment-callback`
- `airtel-callback`
- `moov-callback`
- `singpay-transaction-sync`

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
