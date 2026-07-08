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

**Statut:** corrige et durci cote code, mecanisme de signature officiel SingPay toujours a confirmer  
**Risque:** si `QGABON_WEBHOOK_SECRET`/`SINGPAY_CALLBACK_SECRET` est absent, les callbacks acceptaient toute requete des que `ALLOW_INSECURE_WEBHOOKS=true` trainait dans les secrets d'un environnement, sans lien avec le fait que cet environnement soit reellement local ou non. La comparaison de secret etait aussi un `===` simple, vulnerable en theorie a une attaque par timing.  
**Impact:** confirmation frauduleuse de paiements, commandes confirmees sans paiement reel, reversement declenche pour une commande jamais payee.

**Decision d'ingenierie:** extraire la logique dans `supabase/functions/_shared/webhook-auth.ts` (pure, testable sous Vitest) : comparaison a temps constant (`timingSafeEqual`), et le contournement `ALLOW_INSECURE_WEBHOOKS` n'a plus d'effet que si `SUPABASE_URL` pointe vers le stack local (`127.0.0.1`/`localhost`/`kong:`) - impossible a declencher par erreur sur un vrai projet Supabase, meme si le flag est mal configure en secrets.

**Criteres d'acceptation:**
- Production sans secret retourne `401`, quelle que soit la valeur de `ALLOW_INSECURE_WEBHOOKS`, des que `SUPABASE_URL` n'est pas une URL locale. **Fait, voir `webhook-auth.ts` + `webhook-auth.test.ts` (12 tests).**
- La comparaison de secret n'est plus vulnerable au timing. **Fait via `timingSafeEqual`.**
- Les tentatives refusees sont loguees avec leur motif (`missing_secret_configuration`, `missing_provided_secret`, `secret_mismatch`). **Fait dans `handleSingPayCallback`.**
- La documentation de deploiement liste le secret comme obligatoire. **Fait.**

**Reste ouvert:** aucune signature HMAC officielle SingPay n'est documentee cote fournisseur (`docs/PAYMENT_MULTI_TENANT_ARCHITECTURE.md` §13). Le secret partage reste une hypothese de securite, pas une garantie contractuelle - a remplacer par la signature officielle des qu'elle est confirmee avec SingPay.

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
**Risque:** `.env.example` est ignore, deux lockfiles coexistent, des artefacts de couverture/performance sont versionnes, `supabase.backup/` (residu pre-restructuration) traine, et des scripts de debug racine (`debug_*.cjs/js`) ne sont ni documentes ni utilises par la CI - dont un, `promote_admin.cjs`, contenait un email et un mot de passe reels en clair pour s'auto-promouvoir admin.  
**Impact:** onboarding moins fiable, installations divergentes, depot alourdi, exposition d'un identifiant reel dans l'historique git.

**Decision d'ingenierie:** versionner `.env.example`, choisir npm comme gestionnaire effectif puisque la CI utilise `npm ci`, supprimer le lockfile Bun concurrent, retirer `coverage/`, `lighthouse-results/` et `supabase.backup/` du suivi git (regenerables / obsoletes, historique conserve via `git log`), et supprimer les 7 scripts de debug racine dont `promote_admin.cjs`.

**Criteres d'acceptation:**
- `.env.example` peut etre suivi par Git. **Fait via exception `.gitignore`.**
- Un seul gestionnaire de dependances est recommande. **Fait: `bun.lockb` supprime, `package-lock.json` conserve.**
- Les artefacts generes sont clairement distingues des sources. **Fait: `coverage/`, `lighthouse-results/`, `supabase/.temp` et `supabase/.branches` retires du suivi git et ajoutes au `.gitignore`.**
- `supabase.backup/` (ancien schema pre-restructuration, 2 migrations vs 49 actives) est retire du suivi. **Fait.**
- Aucun identifiant reel ne reste versionne a la racine. **Fait: `promote_admin.cjs` et les 6 `debug_*.cjs/js` supprimes.** Le mot de passe reste dans l'historique git - a faire cote compte concerne (changement de mot de passe), independamment de ce depot.

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

## R8 - Composants dupliques et divergents (Navbar, Footer, FoodCard, UserMenu)

**Statut:** corrige  
**Risque:** `app/_components/{Navbar,Footer,FoodCard,UserMenu}.tsx` et `src/components/{...}` contenaient deux implementations differentes, toutes deux activement utilisees selon la route. Un correctif applique a l'une ne profitait pas a l'autre. Sur 4 pages (`ProductDetailClient`, `MerchantPublicClient`, `merchant/register`, `merchant/register/success`), la Navbar/Footer du layout `(public)` et celle de la page se superposaient (double rendu reel).  
**Impact:** bugs d'incoherence UI silencieux, double barre de navigation/footer sur 4 pages.

**Decision d'ingenierie:** une seule implementation par composant sous `src/components/` (convention d'import `@/*` dominante), fusionnant le meilleur des deux versions (accessibilite ARIA, etat `isReserving`, semantique Next.js sur `UserMenu`, contenu du footer). Suppression du doublon `app/_components/` et de tous les rendus redondants de Navbar/Footer sur les pages deja enveloppees par le layout `(public)`.

**Criteres d'acceptation:**
- Une seule implementation de chaque composant. **Fait.**
- Plus de double Navbar/Footer sur les 4 pages concernees. **Fait.**
- `npm run type-check` et `npm run build` passent apres la fusion. **Fait.**

## R9 - Couverture de tests sans seuil et services critiques non testes

**Statut:** corrige (seuil initial), a faire remonter progressivement  
**Risque:** `vitest.config.ts` ne definissait aucun seuil de couverture, et le calcul par defaut ne comptait que les fichiers deja touches par un test - masquant que `payout.service.ts`, `admin.service.ts` et `payment-transactions.service.ts` (logique payout, promotion/refus marchand, ledger paiement) n'avaient aucun test.  
**Impact:** une regression dans ces services critique peut passer sans friction en CI.

**Decision d'ingenierie:** `coverage.include` force le calcul sur l'ensemble de `src/services` et `src/lib` (pas seulement les fichiers testes), et un seuil plancher (`statements/lines 25%, branches/functions 20%`) est fixe juste sous le niveau mesure apres l'ajout des nouveaux tests - a remonter au fil des prochains chantiers plutot que d'etre laisse a 0.

**Criteres d'acceptation:**
- La CI execute `npm run test:coverage` et echoue sous le seuil. **Fait.**
- `payout.service.ts` et `admin.service.ts` (dont `updateMerchantStatus`, miroir applicatif du trigger anti-escalade de privilege) et `payment-transactions.service.ts` ont des tests de chemin nominal et d'erreur. **Fait.**
- `transaction.service.ts` (donnees mock en memoire, jamais appele en dehors du barrel `src/services/index.ts`) est identifie comme code mort plutot que teste inutilement. **Constate, suppression a decider separement.**

## R10 - Absence de transport d'erreur en production

**Statut:** socle implemente, activation dependante d'un DSN Sentry a creer  
**Risque:** `src/lib/logger.ts` ne faisait qu'un `console.error` en production, avec un commentaire admettant l'absence de service branche. Aucune alerte n'existait sur un incident de paiement ou de securite (ex. callback rejete en boucle).  
**Impact:** un incident en production n'est visible qu'a posteriori dans des logs bruts, pas remonte activement.

**Decision d'ingenierie:** integration de `@sentry/nextjs` (`instrumentation.ts`, `instrumentation-client.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`), branchee dans `logger.error`/`logger.warn`. `Sentry.init()` reste un no-op tant que `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN` ne sont pas configures, donc sans effet de bord avant la creation d'un projet Sentry.

**Criteres d'acceptation:**
- Le code d'integration est en place et ne casse pas le build sans DSN. **Fait, verifie via `npm run build`.**
- Une erreur de niveau `error` est envoyee a Sentry avec sa stack trace des qu'un DSN est configure. **Fait cote code, restant a valider avec un DSN reel.**
- Activation en production. **A faire: creer le projet Sentry et renseigner `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN`.**
