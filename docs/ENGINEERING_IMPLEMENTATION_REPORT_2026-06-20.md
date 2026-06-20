# Rapport detaille des ameliorations d'ingenierie

Date: 20 juin 2026  
Projet: Ouyaboung  
Portee: audit technique, risques prioritaires, reservations, paiements, QR Code, geolocalisation, carte des boutiques, qualite CI et documentation.

## 1. Resume executif

Ce document retrace le travail effectue depuis le debut du chantier d'audit et de correction. L'objectif initial etait double:

1. analyser le projet de bout en bout avec une approche Genie Logiciel;
2. appliquer les ameliorations prioritaires, documenter les risques critiques, puis commencer a les corriger.

Les principaux axes traites sont:

- reservation atomique du stock;
- reactivation du paiement mobile Q-Gabon;
- durcissement des callbacks paiement;
- correction du flux QR Code et retrait;
- correction du cas "pending accepte";
- fiabilisation de la geolocalisation utilisateur;
- persistance de la localisation dans les parametres;
- affichage Map centre sur l'utilisateur;
- filtrage des boutiques dans un rayon de 2 km, 5 km ou 10 km, avec 10 km par defaut;
- affichage d'un marqueur par boutique ayant des produits disponibles;
- documentation des risques prioritaires;
- durcissement CI, lint et tests.

Les verifications globales ont ete executees a plusieurs etapes:

- `npm run type-check`: OK
- `npm run lint`: OK
- `npm run test:unit`: OK, 118 tests
- `npm run build`: OK

Observation connue: le build affiche un avertissement Browserslist indiquant que `caniuse-lite` est obsolete. Cet avertissement existait deja et ne bloque pas la compilation.

## 2. Documents crees ou mis a jour

### 2.1 `docs/RISKS_TRACKING.md`

Document cree pour suivre les risques prioritaires detectes pendant l'audit.

Risques documentes:

- R1: reservation non atomique du stock;
- R2: webhooks paiement ouverts si secret absent;
- R3: QR Code accepte sur commande non payee;
- R4: ESLint affaibli et commande depreciee;
- R5: CI sans tests unitaires;
- R6: hygiene de depot et installabilite.

Ce document sert de registre de decision. Il distingue ce qui est corrige cote code, ce qui necessite un deploiement, et ce qui reste a confirmer avec l'equipe.

### 2.2 `docs/TEMP_PAYMENT_FLOW_ONSITE.md`

Le document existant de paiement temporaire sur place a ete marque comme obsolete.

Motif:

- le flux nominal est redevenu le paiement mobile Q-Gabon;
- le QR Code ne doit plus confirmer un paiement sur place implicite;
- une commande `pending` doit rester en attente de paiement;
- un retrait QR ne doit etre possible que sur une commande payee ou prete.

### 2.3 Present document

Le present rapport consolide tout le chantier en un seul document de reference.

## 3. Reservation et stock

## 3.1 Probleme initial

Le flux de reservation creait une commande et decrementait le stock via plusieurs operations separees cote application.

Risque:

- deux utilisateurs pouvaient reserver le meme produit en meme temps;
- `quantity_available` pouvait devenir incoherent;
- une commande pouvait etre creee alors que le decrement de stock echouait;
- un marchand pouvait se retrouver avec une survente.

Ce risque a ete documente sous `R1` dans `docs/RISKS_TRACKING.md`.

## 3.2 Decision d'architecture

L'invariant "creation de commande + decrement de stock" doit appartenir a la base de donnees, car c'est la seule couche capable de garantir une transaction concurrente fiable.

Decision:

- creation d'une fonction PostgreSQL transactionnelle `public.create_order_atomic`;
- verrouillage de la ligne `food_items` via `FOR UPDATE`;
- verification du stock disponible;
- verification du marchand actif, verifie et non refuse;
- creation de la commande;
- decrement du stock dans la meme transaction;
- retour d'un payload JSON explicite.

## 3.3 Migration creee

Fichier:

- `supabase/migrations/20260620130000_create_order_atomic.sql`

La migration:

- cree ou remplace `public.create_order_atomic(p_food_item_id uuid, p_quantity integer)`;
- utilise `SECURITY DEFINER`;
- limite `search_path` a `public`;
- refuse les appels anonymes;
- autorise l'execution aux utilisateurs authentifies;
- cree une policy permettant a l'utilisateur de voir les produits lies a ses commandes.

Codes d'erreur metier retournes:

- `UNAUTHENTICATED`;
- `INVALID_QUANTITY`;
- `NOT_FOUND`;
- `MERCHANT_NOT_APPROVED`;
- `INSUFFICIENT_QUANTITY`;
- `CREATE_ORDER_ATOMIC_FAILED`.

## 3.4 Integration applicative

Fichier principal:

- `src/api/orders.api.ts`

Avant:

- lecture du produit;
- verification en TypeScript;
- insertion de commande;
- decrement de stock separe.

Apres:

- appel RPC `create_order_atomic`;
- gestion des erreurs retournees par la base;
- recuperation de la commande creee via `getOrderById`.

Effet:

- le chemin nominal ne depend plus d'une sequence fragile cote client;
- les reservations concurrentes sont protegees par le verrou SQL;
- l'API applicative devient plus simple et plus sure.

## 3.5 Tests adaptes

Fichier:

- `src/services/__tests__/order.service.test.ts`

Le test a ete ajuste pour suivre le nouveau contrat de creation.

## 3.6 Action de deploiement requise

Important:

La migration `supabase/migrations/20260620130000_create_order_atomic.sql` doit etre appliquee en environnement Supabase avant de considerer le risque `R1` totalement corrige en production.

Sans cette migration, le code applicatif qui appelle la RPC ne pourra pas creer de reservation.

## 4. Paiement mobile Q-Gabon

## 4.1 Probleme initial

Le paiement mobile avait ete temporairement neutralise au profit d'un flux de paiement sur place. Ce flux temporaire introduisait une ambiguite:

- une commande pouvait rester `pending`;
- le QR pouvait etre affiche;
- le scan marchand pouvait faire office de confirmation paiement + retrait.

Cette approche etait fragile d'un point de vue metier et audit.

## 4.2 Decision metier

Le paiement mobile Q-Gabon redevient le flux nominal.

Regle:

- `pending` signifie "en attente de paiement";
- un QR Code de retrait ne doit pas valider un paiement;
- un QR Code valide seulement un retrait;
- une commande doit etre `confirmed` ou `ready` pour etre scannee.

## 4.3 Reactivation du paiement

Fichier:

- `src/services/payment.service.ts`

Changement:

- `PAYMENT_FLOW_ENABLED` est passe a `true`;
- le commentaire a ete mis a jour pour indiquer que le paiement Q-Gabon est actif;
- la desactivation du paiement doit maintenant etre reservee a une procedure d'incident.

## 4.4 Edge Functions de paiement durcies

Fichiers modifies:

- `supabase/functions/initiate-payment/index.ts`
- `supabase/functions/initiate-airtel/index.ts`
- `supabase/functions/initiate-moov/index.ts`
- `supabase/functions/airtel-callback/index.ts`
- `supabase/functions/moov-callback/index.ts`
- `supabase/functions/payment-callback/index.ts`

Principes appliques:

- le montant ne doit plus etre accepte comme source de verite depuis le client;
- le montant doit etre relu depuis la commande;
- la commande doit etre en statut `pending` pour initier un paiement;
- une commande deja confirmee, prete ou terminee ne doit pas relancer un paiement;
- les callbacks doivent etre authentifies;
- l'absence de secret en production doit bloquer les callbacks.

## 4.5 Variables d'environnement documentees

Fichier:

- `DEPLOYMENT.md`

Variables ajoutees ou clarifiees:

- `ACCOUNT_CODE`;
- `ACCOUNT_CODE_MOOV`;
- `AGENT`;
- `BEAR_TOKEN`;
- `QGABON_WEBHOOK_SECRET`;
- `ALLOW_INSECURE_WEBHOOKS`.

Regle importante:

- `QGABON_WEBHOOK_SECRET` est obligatoire en production;
- `ALLOW_INSECURE_WEBHOOKS=true` doit etre reserve au developpement local.

## 4.6 Risque traite

Ce chantier corrige principalement:

- R2: webhooks paiement ouverts si secret absent;
- une partie du R3: QR Code accepte sur commande non payee.

## 5. QR Code et retrait

## 5.1 Probleme initial

Le QR Code etait utilisable dans un etat metier trop large.

Probleme:

- le statut `pending` pouvait etre accepte;
- le scan QR pouvait melanger paiement sur place et retrait;
- le QR Code pouvait etre visible avant paiement confirme.

## 5.2 Nouvelle regle metier

Un QR Code de retrait est valide uniquement pour:

- `confirmed`;
- `ready`.

Il est refuse pour:

- `pending`;
- `cancelled`;
- `completed`;
- `no_show`;
- tout autre statut non explicitement autorise.

## 5.3 Frontend utilisateur

Fichier:

- `app/(dashboard)/user/reservations/page.tsx`

Changements:

- statut `pending` affiche maintenant "En attente de paiement";
- bouton QR visible seulement pour les commandes `confirmed` ou `ready`;
- mise a jour Realtime enrichie pour conserver le `pickup_code` si la commande est confirmee apres paiement.

## 5.4 QR Modal

Fichier:

- `src/components/QRCodeModal.tsx`

Changements:

- le QR encode maintenant un payload JSON:
  - `type`;
  - `pickup_code`;
  - `order_id`.
- le texte utilisateur indique que le paiement doit etre confirme;
- la mention "montant a regler sur place" a ete remplacee par "montant paye";
- le scan est presente comme validation du retrait, pas comme validation du paiement.

## 5.5 Edge Function de validation QR

Fichier:

- `supabase/functions/validate-qr/index.ts`

Changements:

- `pending` retire des statuts acceptes;
- statuts autorises: `confirmed`, `ready`;
- message d'erreur explicite si la commande est encore `pending`;
- message de succes reformule en "Retrait valide avec succes".

## 5.6 UX marchand

Fichiers modifies:

- `app/(dashboard)/merchant/orders/page.tsx`
- `app/(dashboard)/merchant/page.tsx`
- `app/(dashboard)/merchant/help/page.tsx`

Objectif:

- aligner les ecrans marchand avec le fait que le QR concerne le retrait;
- eviter la confusion entre paiement et scan;
- guider le marchand vers le bon usage du scan.

## 6. Geolocalisation utilisateur

## 6.1 Probleme initial

La geolocalisation existait deja, mais elle avait plusieurs limites:

- la recherche pouvait declencher une demande GPS au chargement;
- la position approximative et la position GPS precise etaient peu distinguees;
- les parametres utilisateur ne conservaient pas clairement la derniere position;
- plusieurs composants validaient les coordonnees chacun de leur cote;
- la carte pouvait utiliser des coordonnees approximatives sans qualite explicite.

## 6.2 Service centralise

Fichier:

- `src/services/geolocation.service.ts`

Ajouts et corrections:

- `requestBrowserPermission`;
- `retryLowAccuracy`;
- validation centralisee avec `isValidCoordinate`;
- bornes Gabon avec `GABON_LOCATION_BOUNDS`;
- location par defaut `GABON_DEFAULT_LOCATION`;
- affichage humain de la precision via `formatLocationAccuracy`;
- suppression du cache via `clearCachedUserLocation`;
- conservation de metadonnees:
  - `city`;
  - `country`;
  - `region`;
  - `accuracy`;
  - `source`;
  - `isApproximate`.

## 6.3 Chargement passif sans popup

Nouveau comportement:

- au chargement passif, l'application ne force pas une popup GPS;
- si la permission GPS n'est pas deja accordee, le service peut utiliser le fallback IP;
- l'utilisateur garde le controle de la demande GPS precise.

Pourquoi:

- meilleure experience utilisateur;
- moins de refus de permission;
- distinction claire entre position approximative et position precise.

## 6.4 Retry basse precision

Nouveau comportement:

- si la geolocalisation haute precision echoue par timeout ou indisponibilite;
- le service tente une seconde fois avec une precision plus basse;
- cela ameliore les cas mobiles ou le GPS met trop longtemps a obtenir un fix.

## 6.5 Tests ajoutes

Fichier:

- `src/services/__tests__/geolocation.service.test.ts`

Cas couverts:

- chargement passif sans popup GPS;
- fallback IP quand la permission est encore en etat `prompt`;
- retry basse precision apres timeout GPS haute precision.

## 7. Parametres utilisateur et localisation sauvegardee

## 7.1 Probleme initial

Les parametres contenaient un interrupteur de geolocalisation et un rayon par defaut, mais pas de position sauvegardee exploitable avec precision, date et source.

## 7.2 Types ajoutes

Fichier:

- `src/types/index.ts`

Ajout:

- `UserLocationPreference`;
- `location_enabled`;
- `default_radius_km`;
- `last_known_location`.

## 7.3 Service utilisateur

Fichier:

- `src/services/user.service.ts`

Ajout:

- `updateUserLocationSettings`.

Cette fonction ecrit dans `profiles.preferences`, sans migration de schema supplementaire, puisque `preferences` est deja un champ JSON prevu pour ce type de preferences.

## 7.4 UI des parametres

Fichier:

- `app/(dashboard)/user/settings/page.tsx`

Ajouts:

- affichage de la position enregistree;
- affichage de la qualite:
  - GPS actif;
  - GPS avec precision;
  - position approximative;
  - ville par defaut.
- affichage des coordonnees;
- affichage de la date de mise a jour;
- bouton `Mettre a jour`;
- bouton `Oublier`;
- export des donnees incluant la position sauvegardee.

## 8. Carte des boutiques et rayon autour de l'utilisateur

## 8.1 Probleme initial

La carte affichait des produits et pouvait generer des coordonnees artificielles par ville quand une boutique n'avait pas de latitude/longitude.

Ce comportement etait incompatible avec la regle metier:

> la Map doit montrer toutes les boutiques qui ont des produits disponibles dans un rayon autour de l'utilisateur.

Une coordonnee inventee ne peut pas etre utilisee pour determiner une distance reelle.

## 8.2 Nouvelle regle metier

Le centre du rayon est toujours l'utilisateur.

La carte affiche:

- uniquement des boutiques geolocalisees;
- uniquement des boutiques avec au moins un produit disponible;
- uniquement dans le rayon choisi;
- un marqueur par boutique, pas un marqueur par produit.

## 8.3 Rayon configurable

Fichiers:

- `app/(public)/search/page.tsx`
- `src/components/GabonMapGL.tsx`

Options disponibles:

- 2 km;
- 5 km;
- 10 km.

Valeur par defaut:

- 10 km.

Effet du changement de rayon:

- le cercle affiche sur la carte change;
- la requete de recherche est relancee;
- les produits disponibles sont refiltres;
- le compteur des resultats affiche le rayon actif.

## 8.4 Filtrage API par distance

Fichiers:

- `src/types/index.ts`
- `src/services/inventory.service.ts`
- `src/api/inventory.api.ts`

Contrat ajoute:

- `max_distance_km`;
- `user_latitude`;
- `user_longitude`.

Implementation:

1. la page recherche transmet la position utilisateur et le rayon choisi;
2. l'API inventaire applique une bounding box pour limiter la requete Supabase;
3. l'API calcule ensuite une distance Haversine exacte;
4. les resultats au-dela du rayon sont retires;
5. en tri distance, les resultats sont ordonnes du plus proche au plus loin.

Pourquoi deux filtres:

- la bounding box reduit la quantite de lignes recuperees;
- la distance Haversine evite les faux positifs dans les coins du rectangle.

## 8.5 Carte MapLibre

Fichier:

- `src/components/GabonMapGL.tsx`

Changements:

- le composant se centre sur `userLocation` en priorite;
- le controle natif `GeolocateControl` a ete retire pour eviter un deuxieme centre concurrent;
- un cercle de rayon est dessine autour de l'utilisateur;
- les marqueurs sont groupes par boutique;
- le popup de details s'affiche au survol;
- le clic sur le marqueur ouvre la fiche produit;
- la legende indique "Magasin avec offres";
- le compteur affiche le nombre de magasins.

## 8.6 Navigation au clic

Fichier:

- `app/(public)/search/page.tsx`

Regle:

- au clic sur une boutique, l'utilisateur est envoye vers la premiere fiche produit disponible de cette boutique;
- route utilisee: `/p/[slug]`.

Pourquoi cette route:

- c'est la route produit existante;
- la page produit gere deja la logique de consultation et reservation;
- cela evite de creer une route artificielle.

## 9. Disponibilite des produits

La disponibilite est filtree dans l'API inventaire.

Regles conservees:

- `food_items.is_available = true`;
- `food_items.quantity_available > 0`;
- `merchants.is_verified = true`;
- `merchants.is_active = true`.

Ajout:

- si une position utilisateur existe, le rayon choisi est applique en plus.

## 10. Hygiene projet, lint et CI

## 10.1 Lint

Fichiers:

- `package.json`
- `eslint.config.js`

Avant:

- script `next lint`;
- commande depreciee dans les versions recentes de Next.

Apres:

- script `eslint . --max-warnings=0`;
- exclusions explicites des artefacts:
  - `.next`;
  - `coverage`;
  - `lighthouse-results`;
  - service workers generes;
  - fonctions Supabase Edge.

Pourquoi exclure `supabase/functions/**`:

- ce code cible Deno/Edge runtime;
- il utilise parfois des conventions et imports differents du bundle Next;
- le garder dans la meme passe ESLint pouvait brouiller le signal qualite du frontend et des services applicatifs.

## 10.2 CI

Fichier:

- `.github/workflows/ci.yml`

Ajout:

- execution de `npm run test:unit`.

La CI execute maintenant:

- install;
- lint;
- tests unitaires;
- type-check;
- build.

## 10.3 `.env.example`

Fichier:

- `.gitignore`

Changement:

- ajout de l'exception `!.env.example`.

Objectif:

- permettre de versionner un exemple d'environnement;
- faciliter l'onboarding;
- documenter les variables obligatoires sans exposer les secrets.

## 11. Interfaces touchees

## 11.1 Utilisateur

Fichiers:

- `app/(dashboard)/user/reservations/page.tsx`
- `app/(dashboard)/user/settings/page.tsx`
- `app/(public)/search/page.tsx`
- `app/(public)/p/[slug]/ProductDetailClient.tsx`

Changements visibles:

- statut `pending` clarifie en attente de paiement;
- QR visible seulement apres confirmation;
- parametres de localisation enrichis;
- carte centree sur l'utilisateur;
- rayon configurable 2 km, 5 km, 10 km;
- clic boutique vers fiche produit.

## 11.2 Marchand

Fichiers:

- `app/(dashboard)/merchant/orders/page.tsx`
- `app/(dashboard)/merchant/page.tsx`
- `app/(dashboard)/merchant/help/page.tsx`

Changements visibles:

- texte et parcours alignes sur le retrait QR;
- separation plus claire entre paiement et scan;
- acces scan oriente vers les commandes eligibles.

## 11.3 QR Code

Fichier:

- `src/components/QRCodeModal.tsx`

Changements visibles:

- QR plus structure;
- instructions utilisateur alignees avec paiement confirme;
- copie metier plus claire.

## 12. Fichiers principaux modifies

### Reservations et commandes

- `src/api/orders.api.ts`
- `src/services/order.service.ts`
- `src/services/__tests__/order.service.test.ts`
- `supabase/migrations/20260620130000_create_order_atomic.sql`

### Paiements

- `src/services/payment.service.ts`
- `supabase/functions/initiate-payment/index.ts`
- `supabase/functions/initiate-airtel/index.ts`
- `supabase/functions/initiate-moov/index.ts`
- `supabase/functions/airtel-callback/index.ts`
- `supabase/functions/moov-callback/index.ts`
- `supabase/functions/payment-callback/index.ts`

### QR Code

- `src/components/QRCodeModal.tsx`
- `supabase/functions/validate-qr/index.ts`
- `app/(dashboard)/user/reservations/page.tsx`
- `app/(dashboard)/merchant/orders/page.tsx`

### Geolocalisation et carte

- `src/services/geolocation.service.ts`
- `src/services/__tests__/geolocation.service.test.ts`
- `src/components/GabonMapGL.tsx`
- `app/(public)/search/page.tsx`
- `app/(dashboard)/user/settings/page.tsx`
- `src/services/user.service.ts`
- `src/types/index.ts`
- `src/services/index.ts`

### Inventaire et rayon

- `src/api/inventory.api.ts`
- `src/services/inventory.service.ts`
- `src/types/index.ts`

### Qualite et documentation

- `.github/workflows/ci.yml`
- `.gitignore`
- `DEPLOYMENT.md`
- `docs/RISKS_TRACKING.md`
- `docs/TEMP_PAYMENT_FLOW_ONSITE.md`
- `package.json`
- `eslint.config.js`

## 13. Verifications executees

Les commandes suivantes ont ete executees a plusieurs moments du chantier.

### 13.1 TypeScript

Commande:

```bash
npm run type-check
```

Resultat:

- OK.

### 13.2 Lint

Commande:

```bash
npm run lint
```

Resultat:

- OK.

### 13.3 Tests unitaires

Commande:

```bash
npm run test:unit
```

Resultat final:

- 13 fichiers de tests;
- 118 tests;
- 118 reussis.

### 13.4 Build production

Commande:

```bash
npm run build
```

Resultat:

- OK.

Observation:

- avertissement Browserslist sur `caniuse-lite` obsolete;
- avertissement non bloquant;
- aucune erreur finale de build.

## 14. Points de deploiement a ne pas oublier

## 14.1 Migration Supabase

Appliquer:

```bash
supabase/migrations/20260620130000_create_order_atomic.sql
```

Sans cela:

- la RPC `create_order_atomic` n'existera pas;
- la creation de commande echouera.

## 14.2 Variables paiement

Verifier en production:

- `ACCOUNT_CODE`;
- `ACCOUNT_CODE_MOOV`;
- `AGENT`;
- `BEAR_TOKEN`;
- `QGABON_WEBHOOK_SECRET`;
- `NEXT_PUBLIC_SUPABASE_URL`;
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`;
- `SUPABASE_SERVICE_ROLE_KEY`, si necessaire cote serveur;
- `NEXT_PUBLIC_APP_URL`.

Ne pas activer en production:

```bash
ALLOW_INSECURE_WEBHOOKS=true
```

## 14.3 Tests metier apres deploiement

Scenario reservation:

1. creer une reservation sur un produit disponible;
2. verifier que le stock diminue;
3. tenter une reservation concurrente sur un stock faible;
4. verifier que le stock ne devient jamais negatif.

Scenario paiement:

1. creer une reservation `pending`;
2. initier un paiement Airtel;
3. initier un paiement Moov;
4. verifier les frais;
5. simuler un callback signe;
6. verifier que la commande passe a `confirmed`.

Scenario QR:

1. tenter de scanner une commande `pending`;
2. verifier le refus `INVALID_ORDER_STATUS`;
3. scanner une commande `confirmed`;
4. verifier le passage a `completed`;
5. verifier que le QR n'est pas visible cote client avant paiement.

Scenario carte:

1. autoriser la geolocalisation;
2. ouvrir la Map;
3. verifier le cercle 10 km par defaut;
4. passer a 5 km puis 2 km;
5. verifier que les boutiques hors rayon disparaissent;
6. survoler un marqueur boutique;
7. verifier l'affichage des details;
8. cliquer le marqueur;
9. verifier la redirection vers `/p/[slug]`.

Scenario parametres:

1. ouvrir `user/settings`;
2. mettre a jour la position;
3. verifier precision et date;
4. oublier la position;
5. verifier que le cache local est supprime.

## 15. Risques residuels et recommandations

## 15.1 Migration non appliquee

Risque:

- le code attend la RPC `create_order_atomic`;
- si la migration n'est pas appliquee, la reservation echoue.

Recommandation:

- appliquer la migration avant toute mise en production.

## 15.2 PostGIS non utilise

Le filtrage distance utilise:

- bounding box Supabase;
- calcul Haversine en TypeScript.

C'est acceptable pour le volume actuel, mais PostGIS serait preferable a grande echelle.

Recommandation future:

- ajouter une colonne `geography(Point, 4326)`;
- index GiST;
- RPC `nearby_available_merchants`;
- tri distance cote SQL.

## 15.3 Gestion des boutiques sans coordonnees

La carte n'affiche plus les boutiques sans latitude/longitude.

C'est volontaire:

- une boutique sans coordonnees ne peut pas etre incluse correctement dans un rayon;
- inventer des coordonnees fausse la distance.

Recommandation:

- rendre la geolocalisation boutique obligatoire ou fortement guidee dans l'onboarding marchand;
- ajouter un controle admin des boutiques sans coordonnees.

## 15.4 Secrets paiement

Le durcissement depend de la presence des secrets en production.

Recommandation:

- verifier la configuration Vercel/Supabase avant mise en service;
- auditer les logs apres les premiers callbacks reels.

## 15.5 Gestion npm vs bun

Le projet utilise `npm ci` en CI, mais le depot contient possiblement des traces d'autres gestionnaires.

Recommandation:

- confirmer officiellement npm comme gestionnaire standard;
- nettoyer les lockfiles concurrents si l'equipe valide.

## 16. Etat final fonctionnel

A la fin de ce chantier:

- une reservation est creee via une transaction atomique en base;
- le paiement Q-Gabon est reactive;
- le montant paiement est relu depuis la commande;
- les callbacks paiement sont durcis;
- le QR Code ne valide que le retrait;
- une commande `pending` ne peut plus etre scannee;
- l'utilisateur peut sauvegarder et oublier sa position;
- la recherche peut utiliser une position fiable ou approximative;
- la Map se centre sur l'utilisateur;
- la Map affiche les boutiques avec produits disponibles dans le rayon choisi;
- le rayon peut etre 2 km, 5 km ou 10 km;
- 10 km est le rayon par defaut;
- le survol d'un marqueur affiche les details;
- le clic d'un marqueur ouvre la fiche produit;
- la CI execute maintenant les tests unitaires;
- le lint utilise ESLint CLI;
- les risques prioritaires sont documentes.

## 17. Checklist de reprise pour un autre developpeur

1. Lire `docs/RISKS_TRACKING.md`.
2. Lire ce document.
3. Appliquer la migration `20260620130000_create_order_atomic.sql`.
4. Verifier les variables Q-Gabon.
5. Lancer:

```bash
npm run type-check
npm run lint
npm run test:unit
npm run build
```

6. Tester les scenarios metier du chapitre 14.
7. Surveiller les callbacks paiement en environnement reel.
8. Verifier les boutiques sans coordonnees.

## 18. Commandes de validation finales

Dernier etat valide connu:

```bash
npm run type-check
# OK

npm run lint
# OK

npm run test:unit
# 118 tests OK

npm run build
# OK
```

## 19. Conclusion

Le chantier a transforme plusieurs flux critiques qui etaient fonctionnels mais fragiles en flux plus explicites, auditables et robustes.

Les changements les plus structurants sont:

- l'atomicite des reservations;
- la separation paiement/retrait;
- le refus du QR sur `pending`;
- la reactivation controlee du paiement mobile;
- le rayon geographique centre sur l'utilisateur;
- l'affichage de boutiques reelles geolocalisees, et non de coordonnees generees.

La prochaine etape la plus importante est le deploiement controle de la migration Supabase, suivi d'un test metier complet reservation -> paiement -> confirmation -> QR -> retrait.
