# Référence des Routes - Ouyaboung Platform

Ce document liste les routes de l'application Next.js 15 (App Router).

## Routes Frontend (Next.js App Router)

### Routes publiques — `app/(public)/`

| Route | Fichier | Description |
|-------|---------|-------------|
| `/` | `app/(public)/page.tsx` | Page d'accueil |
| `/search` | `app/(public)/search/page.tsx` | Recherche de produits + carte |
| `/concept` | `app/(public)/concept/page.tsx` | Comment ça marche |
| `/about` | `app/(public)/about/page.tsx` | À propos |
| `/p/[slug]` | `app/(public)/p/[slug]/page.tsx` | Détail produit (ISR 10 min) |
| `/m/[slug]` | `app/(public)/m/[slug]/page.tsx` | Vitrine marchand (ISR 10 min) |
| `/merchant/register` | `app/(public)/merchant/register/page.tsx` | Inscription commerçant |
| `/merchant/register/success` | `app/(public)/merchant/register/success/page.tsx` | Confirmation inscription |
| `/legal/cgu` | `app/(public)/legal/cgu/page.tsx` | CGU |
| `/legal/privacy` | `app/(public)/legal/privacy/page.tsx` | Confidentialité |
| `/legal/help` | `app/(public)/legal/help/page.tsx` | Centre d'aide |

### Authentification — `app/auth/`

| Route | Description |
|-------|-------------|
| `/auth` | Connexion / inscription |
| `/forgot-password` | Mot de passe oublié |
| `/auth/reset` | Réinitialisation mot de passe |

### Dashboard utilisateur — `app/(dashboard)/user/`

| Route | Description |
|-------|-------------|
| `/user` | Dashboard utilisateur |
| `/user/reservations` | Mes réservations |
| `/user/favorites` | Mes favoris |
| `/user/impact` | Mon impact environnemental |
| `/user/profile` | Mon profil |
| `/user/notifications` | Mes notifications |
| `/user/settings` | Paramètres |
| `/user/transactions` | Historique paiements |
| `/user/help` | Aide |

### Dashboard commerçant — `app/(dashboard)/merchant/`

| Route | Description |
|-------|-------------|
| `/merchant` | Dashboard commerçant |
| `/merchant/products` | Gestion des produits |
| `/merchant/orders` | Commandes reçues |
| `/merchant/analytics` | Analytics |
| `/merchant/impact` | Impact environnemental |
| `/merchant/profile` | Profil du commerce |
| `/merchant/settings` | Paramètres |
| `/merchant/scan` | Scan QR retrait |
| `/merchant/transactions` | Historique ventes |
| `/merchant/notifications` | Notifications |
| `/merchant/help` | Aide |

### Dashboard administrateur — `app/(dashboard)/admin/`

| Route | Description |
|-------|-------------|
| `/admin` | Dashboard admin |
| `/admin/merchants` | Gestion des marchands |
| `/admin/validations` | Validations en attente |
| `/admin/clients` | Gestion des clients |
| `/admin/products` | Gestion des produits |
| `/admin/transactions` | Transactions |
| `/admin/analytics` | Analytics |
| `/admin/geo` | Géolocalisation |
| `/admin/settings` | Paramètres |
| `/admin/notifications` | Notifications |

### Autres routes

| Route | Description |
|-------|-------------|
| `/impact` | Impact global |
| `/maintenance` | Mode maintenance |
| `/sitemap.xml` | Sitemap dynamique (`app/sitemap.ts`) |
| `/robots.txt` | Robots (`app/robots.ts`) |

## Routes API Next.js — `app/api/`

| Méthode | Route | Accès | Description |
|---------|-------|-------|-------------|
| `POST` | `/api/analytics/events` | Public (rate-limited) | Ingestion batch tracking |
| `OPTIONS` | `/api/analytics/events` | Public | Preflight CORS |
| `POST` | `/api/analytics/vitals` | Public (rate-limited) | Collecte Web Vitals |
| `GET` | `/api/analytics/intelligence` | Auth / admin / service key | Lecture profil intelligence |
| `POST` | `/api/analytics/intelligence` | Admin / `x-intelligence-key` | Écriture scores intelligence |
| `GET` | `/api/analytics/export` | Admin / `x-analytics-export-key` | Export analytics JSON/CSV |
| `GET` | `/api/admin/traffic-metrics` | Admin | KPIs trafic dashboard |
| `POST` | `/api/admin/users/role` | Admin | Changement de rôle |
| `POST` | `/api/admin/merchant-email` | Admin | Email marchand |
| `POST` | `/api/merchant/onboarding-notify` | Auth marchand | Notification onboarding |
| `GET` | `/api/geolocation/fallback` | Public | Géolocalisation fallback |

## Edge Functions Supabase — `supabase/functions/`

| Fonction | Description |
|----------|-------------|
| `initiate-airtel` | Paiement Airtel Money (Q-Gabon) |
| `initiate-moov` | Paiement Moov Money |
| `initiate-payment` | Initiation paiement générique |
| `airtel-callback` | Webhook callback Airtel |
| `moov-callback` | Webhook callback Moov |
| `payment-callback` | Webhook paiement générique |
| `validate-qr` | Validation code QR retrait |

## Couche données applicative

Les pages et composants accèdent aux données via **`src/services/`** (logique métier), qui s'appuie sur **`src/api/`** (accès Supabase). Les lectures publiques ISR utilisent **`src/lib/data/public.server.ts`**.

## Tables principales (PostgreSQL / Supabase)

1. `profiles` — Profils utilisateurs
2. `merchants` — Commerces
3. `food_items` — Produits alimentaires
4. `orders` — Commandes / réservations
5. `transactions` — Paiements Q-Gabon
6. `notifications` — Notifications
7. `favorites` — Favoris
8. `user_events` — Tracking comportemental
9. `platform_settings` — Configuration (dont `admin_emails`)
10. `merchant_transactions` — Vue transactions enrichie

## Sécurité

- Middleware Next.js : protection `/user/*`, `/merchant/*`, `/admin/*`
- Row Level Security (RLS) sur toutes les tables sensibles
- Promotion admin via `platform_settings.admin_emails` (plus d'emails hardcodés en SQL)
- Rate limiting analytics : Upstash Redis (si configuré) ou mémoire locale

## Notes

- Framework : **Next.js 15 App Router** (pas React Router)
- Backend : **Supabase** (PostgreSQL, Auth, Realtime, Storage, Edge Functions)
- Prix en **FCFA (XAF)**, dates en **UTC (timestamptz)**
- PWA activée en production via `next-pwa`
