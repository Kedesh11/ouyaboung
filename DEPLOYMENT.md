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

## 3. Variables d'Environnement

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

> [!IMPORTANT]
> Ne jamais commiter vos clés secrètes (`service_role`, `BEAR_TOKEN`, `QGABON_WEBHOOK_SECRET`) dans le code. Utilisez toujours les variables d'environnement.

> [!WARNING]
> `ALLOW_INSECURE_WEBHOOKS=true` est reserve au developpement local. En production, laissez cette variable absente ou a `false` et configurez toujours `QGABON_WEBHOOK_SECRET`.

## 4. CI/CD (GitHub Actions)

Un pipeline d'intégration continue est configuré dans `.github/workflows/ci.yml`.
Il s'exécute à chaque `push` ou `pull_request` sur `main` et `develop` et effectue :
- **Linting** : Vérifie la qualité du code.
- **Type Checking** : Vérifie les erreurs TypeScript.
- **Build** : Vérifie que le projet compile correctement.

Si une de ces étapes échoue, le déploiement sera bloqué (si vous configurez les règles de protection de branche sur GitHub).

## 5. Sécurité (vercel.json)

Le fichier `vercel.json` à la racine configure automatiquement des en-têtes de sécurité HTTP stricts (XSS Protection, No-Sniff, etc.) et des règles de mise en cache pour les performances.
