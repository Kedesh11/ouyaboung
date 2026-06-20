# Suivi des risques prioritaires

Ce document suit les risques critiques identifies lors de l'audit du projet Ouyaboung. Il sert de registre de decision et de checklist de correction.

## R1 - Reservation non atomique du stock

**Statut:** corrige cote code, migration a deployer  
**Risque:** deux clients peuvent reserver le meme panier si la lecture du stock, la creation de commande et le decrement sont executes separement.  
**Impact:** survente, litiges marchands, commandes impossibles a honorer.

**Decision d'ingenierie:** deplacer l'invariant stock + commande dans PostgreSQL via RPC transactionnelle `create_order_atomic`. La base doit verrouiller la ligne `food_items` avec `FOR UPDATE`, verifier le marchand, creer la commande, puis decremente le stock dans la meme transaction.

**Criteres d'acceptation:**
- Une reservation concurrente ne peut jamais rendre `quantity_available` negatif. **Fait via `create_order_atomic`.**
- Une commande n'est creee que si le decrement de stock reussit. **Fait via RPC transactionnelle.**
- L'ancien flux client-side n'est plus le chemin nominal. **Fait dans `src/api/orders.api.ts`.**

**Suivi de deploiement:** appliquer `supabase/migrations/20260620130000_create_order_atomic.sql` avant de valider ce risque en production.

## R2 - Webhooks paiement ouverts si secret absent

**Statut:** corrige cote code, variable production requise  
**Risque:** si `QGABON_WEBHOOK_SECRET` est absent, les callbacks Q-Gabon acceptent toute requete.  
**Impact:** confirmation frauduleuse de paiements, commandes confirmees sans paiement reel.

**Decision d'ingenierie:** en production, l'absence de secret doit refuser les webhooks. La tolerance sans secret ne doit exister qu'en developpement local explicite.

**Criteres d'acceptation:**
- Production sans `QGABON_WEBHOOK_SECRET` retourne `401`, sauf si `ALLOW_INSECURE_WEBHOOKS=true`. **Fait.**
- Les headers sensibles restent redactes dans les logs. **Conserve.**
- La documentation de deploiement liste le secret comme obligatoire. **Fait.**

## R3 - QR Code accepte sur commande non payee

**Statut:** corrige cote code  
**Risque:** le scan acceptait les commandes `pending`, ce qui melangeait reservation, paiement sur place et retrait.  
**Impact:** une commande pouvait etre marquee terminee avant paiement confirme.

**Decision d'ingenierie:** le QR de retrait valide uniquement les commandes `confirmed` ou `ready`. Le flux "paiement sur place" doit etre un flux metier separe, explicite et auditable, pas un effet secondaire du scan.

**Criteres d'acceptation:**
- Le client ne voit pas de QR tant que la commande n'est pas payee/confirmee. **Fait.**
- La Edge Function `validate-qr` refuse `pending`. **Fait.**
- Le code de retrait reste stable entre reservation et confirmation pour eviter les divergences UI/DB. **Fait.**

## R4 - ESLint affaibli et commande depreciee

**Statut:** correction partielle appliquee  
**Risque:** `next lint` est deprecie et plusieurs regles importantes sont desactivees.  
**Impact:** regressions React hooks, dette `any`, variables inutiles, signaux qualite affaiblis.

**Decision d'ingenierie:** migrer le script lint vers ESLint CLI et reactiver progressivement les regles critiques, en commencant par garder la CI fonctionnelle.

**Criteres d'acceptation:**
- `npm run lint` n'utilise plus `next lint`. **Fait.**
- Le plugin Next est correctement pris en compte. **Fait via ESLint CLI + config existante.**
- Les regles React hooks sont appliquees avant durcissement final de `any`. **Partiel: les hooks sont charges, mais plusieurs regles restent volontairement desactivees pour eviter un chantier trop large.**

## R5 - CI sans tests unitaires

**Statut:** corrige  
**Risque:** la CI compile mais ne lance pas la suite Vitest.  
**Impact:** une PR peut casser des fonctions testees localement sans etre bloquee.

**Decision d'ingenierie:** ajouter `npm run test:unit` au workflow GitHub Actions.

**Criteres d'acceptation:**
- La CI execute lint, tests, type-check et build. **Fait.**
- Les tests restent rapides et deterministes.

## R6 - Hygiene de depot et installabilite

**Statut:** corrige cote depot  
**Risque:** `.env.example` est ignore, deux lockfiles coexistent, et des artefacts de couverture/performance sont versionnes.  
**Impact:** onboarding moins fiable, installations divergentes, depot alourdi.

**Decision d'ingenierie:** versionner `.env.example`, choisir npm comme gestionnaire effectif puisque la CI utilise `npm ci`, et supprimer le lockfile Bun concurrent.

**Criteres d'acceptation:**
- `.env.example` peut etre suivi par Git. **Fait via exception `.gitignore`.**
- Un seul gestionnaire de dependances est recommande. **Fait: `bun.lockb` supprime, `package-lock.json` conserve.**
- Les artefacts generes sont clairement distingues des sources. **A faire: decider si `coverage/` et `lighthouse-results/` restent versionnes.**

## R7 - Paiement non multi-tenant

**Statut:** socle implemente, activation production a valider  
**Risque:** le paiement Q-Gabon actuel reste structure autour d'une configuration plateforme globale sans ledger de reversement dynamique. Le modele cible SingPay impose un portefeuille principal Ouyaboung, des beneficiaires Airtel/Moov verifies et des settlements idempotents.  
**Impact:** mauvais destinataire de reversement, commission incorrecte, double paiement marchand, reconciliation difficile, risque de melanger les transactions de plusieurs boutiques.

**Decision d'ingenierie:** ne pas modifier partiellement le paiement dans ce lot. Documenter l'architecture cible SingPay avec wallet principal et reversements dynamiques, puis ouvrir un chantier paiement specifique couvrant schema, Edge Functions, callbacks, dashboard marchand, admin, settlement et tests.

**Criteres d'acceptation du futur chantier:**
- Ouyaboung possede un wallet principal SingPay actif par environnement. **Socle fait via `platform_payment_wallets` + variables env.**
- Chaque boutique possede un ou plusieurs numeros payout Airtel/Moov verifies. **Schema/RLS faits, UI dediee a finaliser.**
- L'admin peut aussi configurer des numeros payout Airtel/Moov verifies. **Schema/RLS faits, UI dediee a finaliser.**
- L'Edge Function resout le wallet principal, le marchand et le payout depuis `order -> food_item -> merchant`, jamais depuis le client. **Fait.**
- Les callbacks confirment une transaction interne rattachee a la commande, a la boutique et au wallet principal. **Fait.**
- Les settlements calculent commission plateforme et montant net marchand. **Fait avec `PLATFORM_COMMISSION_RATE`.**
- Les reversements SingPay sont idempotents et traces avant/apres `POST /transfer`. **Socle fait, activation protegee par `SINGPAY_TRANSFERS_ENABLED=false`.**
- Les comptes payout sont proteges par RLS et validation admin. **Fait cote schema.**
- Les secrets SingPay restent serveur uniquement. **Fait cote variables serveur.**
- Les statuts SingPay sont mappes vers les statuts internes sans confirmer une commande tant que le resultat provider n'est pas `Success`. **Fait.**

**Documentation cible:** `docs/PAYMENT_MULTI_TENANT_ARCHITECTURE.md` et `docs/SINGPAY_SWAGGER_ANALYSIS.md`.
