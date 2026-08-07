# Tests end-to-end (intégration, régression, charge)

Cette suite complète les tests Vitest unitaires (`src/**/__tests__/*.test.ts`, Supabase toujours mocké) par des tests qui passent par un **vrai navigateur** et une **vraie base Supabase locale**. Elle ne touche jamais un environnement de production.

## Vue d'ensemble

| Outil | Rôle | Commande |
|---|---|---|
| Vitest | Tests unitaires (Supabase mocké) | `npm run test:unit` |
| Playwright | Tests end-to-end (intégration + régression, navigateur réel) | `npm run test:e2e` / `npm run test:regression` |
| Artillery | Tests de charge (montée en charge sur des routes réelles) | `npm run test:load` / `npm run test:load:auth` |

Les tests « intégration » et « régression » demandés sont **la même suite Playwright** : un test qui passe par un vrai navigateur et une vraie base de données est déjà un test d'intégration. Le tag `@regression` (présent sur toutes les specs actuelles) sert de filtre pour la commande `test:regression`, utilisée en CI sur chaque PR.

## Prérequis locaux

- Docker (pour la stack Supabase locale)
- Supabase CLI (`supabase --version`)
- Playwright + Chromium : `npx playwright install chromium` (une seule fois)

## Lancer la suite E2E en local

```bash
# 1. Démarrer (ou réinitialiser) la base locale - applique toutes les migrations
supabase start
# ou, pour repartir d'une base 100% propre :
supabase db reset

# 2. Lancer la suite (Playwright construit et démarre lui-même un `next start`
#    pointé sur la stack Supabase locale - voir playwright.config.ts webServer)
npm run test:regression   # sous-ensemble @regression, utilisé en CI
npm run test:e2e          # toute la suite
npm run test:e2e:ui       # mode interactif (débogage pas à pas)
```

Au premier lancement, `e2e/global-setup.ts` crée automatiquement 5 comptes de test pré-approuvés (`user`, `merchant`, `farmer`, `driver`, `admin` - voir `e2e/fixtures/test-users.ts`) ainsi qu'un invendu de test (`e2e-reservation-item`), directement via l'API admin Supabase. Ces comptes n'existent que dans la base locale.

## Ce que couvre chaque spec (`e2e/*.spec.ts`)

- **`auth.spec.ts`** — connexion des 5 rôles et redirection vers le bon espace, garde de route sur `/admin` sans session, erreur affichée sur identifiants invalides, et une inscription **réelle** (chauffeur) confirmée via l'API admin Supabase puis connexion. (Ce projet route les emails d'auth vers un vrai SMTP même en local — `supabase/config.toml` `[auth.email.smtp] enabled = true` — donc le mailer local ne reçoit jamais rien ; confirmer via l'API admin est la façon fiable et indépendante de l'environnement de tester ce chemin.)
- **`user-reservation.spec.ts`** — un consommateur réserve un invendu, la réservation apparaît côté marchand.
- **`merchant-onboarding.spec.ts`** — un admin valide puis refuse (avec motif obligatoire) une demande d'inscription marchand.
- **`b2b-marketplace.spec.ts`** — un agriculteur publie un produit, un commerçant commande, l'agriculteur confirme puis marque la commande prête.
- **`delivery-cycle.spec.ts`** — un chauffeur accepte une livraison prête, la récupère, la met en route, confirme avec une photo de preuve ; vérifie que la commande passe bien à `delivered` en base. La géolocalisation est simulée (`context.setGeolocation`).
- **`driver-onboarding.spec.ts`** — validation/refus admin d'une demande chauffeur (miroir de `merchant-onboarding.spec.ts`).

`e2e/utils/db.ts` expose des helpers `service_role` pour arranger un état (candidature en attente, commande déjà prête) sans repasser par toute l'UI à chaque fois — chaque spec reste néanmoins indépendante et exécutable seule.

## Tests de charge

```bash
npm run build && npm run start -- -p 3005   # dans un terminal
npm run test:load                            # trafic public non authentifié
npm run test:load:auth                       # 1-2 parcours connectés (moteur Playwright d'Artillery)
```

- `load/public-pages.yml` monte en charge sur `/`, `/search`, `/agriculteurs`, une fiche produit — moteur HTTP natif Artillery.
- `load/authenticated-flows.yml` (+ `load/authenticated-flows.js`) rejoue une poignée de sessions connectées via `artillery-engine-playwright`, à concurrence modérée (pas un stress test destructeur).

Ces tests ne bloquent jamais les PR (trop lents/instables pour du gating) : ils tournent dans `.github/workflows/load-test.yml`, déclenché manuellement ou chaque lundi.

## CI

`.github/workflows/ci.yml` lance `npm run test:regression` sur chaque PR, après avoir démarré la stack Supabase locale déjà utilisée pour la vérification des types (`supabase gen types`). Un échec de la suite E2E bloque la PR au même titre qu'un échec de lint/type-check/build.

## Lire un rapport

```bash
npx playwright show-report   # rapport HTML de la dernière exécution Playwright
```

Artillery affiche son résumé directement dans la sortie de la commande (latences p50/p95/p99, taux d'erreur par scénario).
