# Architecture cible du paiement multi-tenant SingPay

Date: 20 juin 2026  
Statut: socle technique implemente, deploiement et validation SingPay reels a effectuer  
Provider cible: SingPay, analyse Swagger detaillee dans `docs/SINGPAY_SWAGGER_ANALYSIS.md`.

## 1. Decision de modele

Le modele cible n'est pas "un portefeuille SingPay complet par boutique".

Le modele confirme est:

```text
client -> paiement SingPay -> portefeuille principal Ouyaboung -> reversements dynamiques
```

Le portefeuille principal Ouyaboung recoit tous les encaissements. Ensuite, Ouyaboung repartit l'argent vers:

- la boutique qui possede le produit vendu;
- le compte admin ou plateforme pour les frais;
- eventuellement d'autres beneficiaires internes si le modele evolue.

La capture du portefeuille SingPay montre trois elements structurants:

- un `Wallet ID / ID du portefeuille` principal;
- une `Callback URL`;
- une section `Transfer` contenant des beneficiaires avec `Libelle`, `Telephone`, operateur et `Disbursement ID`.

Donc, pour Ouyaboung, les boutiques et l'admin ne doivent pas renseigner des credentials API SingPay complets. Ils doivent renseigner des numeros mobile money eligibles Airtel ou Moov, qui seront verifies puis relies a un identifiant de reversement SingPay.

## 2. Probleme a resoudre

Le paiement Q-Gabon actuellement reactive fonctionne comme un flux plateforme global. SingPay doit remplacer ce modele avec une architecture marketplace plus propre:

- le client paie une commande Ouyaboung;
- la commande appartient a une boutique via le produit;
- le paiement est encaisse par le portefeuille principal Ouyaboung;
- la plateforme garde sa commission, actuellement 10%;
- le solde marchand est reverse vers le numero mobile money valide de la boutique;
- le compte admin peut aussi recevoir sa part vers un numero mobile money valide, si l'equipe choisit de sortir la commission du wallet principal.

Le risque principal n'est plus seulement le mauvais portefeuille d'encaissement. Le vrai risque devient:

> encaisser correctement dans le wallet principal, puis reverser le bon montant au bon beneficiaire, une seule fois, avec une piste d'audit complete.

## 3. Regles metier cibles

Pour toute commande payee:

1. la commande reference un produit;
2. le produit reference une boutique via `merchant_id`;
3. la boutique possede au moins un beneficiaire de reversement verifie;
4. le paiement client est initie sur le wallet principal Ouyaboung;
5. la transaction interne conserve la boutique, la commande, le montant total et la reference SingPay;
6. apres confirmation du paiement, Ouyaboung calcule:
   - commission plateforme;
   - montant net marchand;
   - montant eventuel a reverser au compte admin;
7. les reversements sont crees depuis une table interne de settlement;
8. une commande n'est jamais confirmee uniquement parce qu'un reversement a ete demande.

Invariant important:

> Le frontend ne choisit jamais le wallet, le disbursement ID, le montant, la commission ou le beneficiaire final.

Ces valeurs sont resolues cote serveur depuis:

```text
order -> food_item -> merchant -> merchant_payout_account
```

## 3.1 Association produit et paiement

SingPay ne fournit pas, dans le Swagger analyse, de ressource "produit" ou de champ dedie pour associer un produit a un identifiant de paiement.

L'association doit donc etre faite dans Ouyaboung.

Regle recommandee:

```text
product -> merchant -> payout account
order -> product -> payment transaction -> settlement
```

Le produit ne doit pas porter directement un `wallet_id`, un `client_id`, un `client_secret` ou un `Disbursement ID` choisi par le frontend. Il doit rester rattache a sa boutique. Le serveur utilise ensuite cette relation pour calculer le beneficiaire du reversement.

Cas standard:

- un produit appartient a une boutique;
- la boutique possede un compte payout verifie;
- le paiement est initie sur le wallet principal;
- apres confirmation, le settlement reverse le net marchand vers le payout de la boutique.

Cas avance, uniquement si necessaire:

- un produit peut avoir un compte payout override;
- l'override doit etre admin-only;
- l'override doit pointer vers un payout verifie;
- la transaction et le settlement doivent enregistrer le `product_id` et le `payout_account_id` effectivement utilises.

Ce modele permet d'associer chaque produit a un destinataire de paiement sans demander a SingPay de stocker nos produits.

## 4. Donnees a introduire

### 4.1 Table `platform_payment_wallets`

Cette table represente le portefeuille principal SingPay de la plateforme.

```sql
create table public.platform_payment_wallets (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('singpay')),
  wallet_id text not null,
  client_id text not null,
  client_secret_encrypted text not null,
  callback_url text,
  airtel_merchant_number text,
  airtel_merchant_code_encrypted text,
  moov_merchant_number text,
  provider_metadata jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Contraintes recommandees:

- un seul wallet principal actif par environnement;
- `client_secret_encrypted` et les codes marchands ne sont jamais exposes cote client;
- `callback_url` doit pointer vers une Edge Function Ouyaboung controlee;
- les modifications sont reservees aux admins.

### 4.2 Table `merchant_payout_accounts`

Cette table represente les numeros mobile money des boutiques.

```sql
create table public.merchant_payout_accounts (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  provider text not null check (provider in ('singpay')),
  operator text not null check (operator in ('airtel', 'moov')),
  label text not null,
  msisdn text not null,
  normalized_msisdn text not null,
  disbursement_id text,
  verification_status text not null default 'pending'
    check (verification_status in ('pending','verified','rejected','disabled')),
  rejection_reason text,
  is_default boolean not null default false,
  is_active boolean not null default true,
  verified_by uuid references auth.users(id),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Objectifs:

- permettre a chaque boutique de renseigner un ou plusieurs numeros Airtel/Moov;
- verifier que le numero est eligible avant paiement production;
- stocker le `Disbursement ID` SingPay quand le beneficiaire existe dans la section `Transfer` du portefeuille principal;
- empecher un reversement vers un numero non verifie.

### 4.3 Table `admin_payout_accounts`

Cette table represente les numeros mobile money des admins ou de la plateforme.

```sql
create table public.admin_payout_accounts (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('singpay')),
  operator text not null check (operator in ('airtel', 'moov')),
  label text not null,
  msisdn text not null,
  normalized_msisdn text not null,
  disbursement_id text,
  verification_status text not null default 'pending'
    check (verification_status in ('pending','verified','rejected','disabled')),
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  verified_by uuid references auth.users(id),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Cette table est utile si la commission plateforme doit etre sortie du wallet principal vers un numero Airtel/Moov admin. Si la commission reste dans le wallet principal, elle reste quand meme tracee dans le ledger.

### 4.4 Table `payment_transactions`

```sql
create table public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  merchant_id uuid not null references public.merchants(id),
  platform_wallet_id uuid not null references public.platform_payment_wallets(id),
  provider text not null check (provider in ('singpay')),
  operator text not null check (operator in ('airtel','moov','maviance','external')),
  internal_reference text not null unique,
  provider_transaction_id text,
  provider_status text,
  provider_result text,
  status text not null check (status in ('initiated','pending','confirmed','failed','cancelled','expired','refunded')),
  amount integer not null,
  currency text not null default 'XAF',
  raw_request jsonb,
  raw_response jsonb,
  raw_callback jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Mapping SingPay:

- `internal_reference`: reference Ouyaboung envoyee dans `reference`;
- `provider_transaction_id`: identifiant SingPay retourne dans `transaction.id`;
- `provider_status`: `Start`, `Partenaire`, `Terminate`, `Disbursement` ou `Refund`;
- `provider_result`: `Success`, `PasswordError`, `BalanceError`, `TimeOutError` ou `Error`.

### 4.5 Table `payment_settlements`

Cette table trace les montants a reverser apres encaissement.

```sql
create table public.payment_settlements (
  id uuid primary key default gen_random_uuid(),
  payment_transaction_id uuid not null references public.payment_transactions(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  merchant_id uuid references public.merchants(id),
  recipient_type text not null check (recipient_type in ('merchant','platform')),
  merchant_payout_account_id uuid references public.merchant_payout_accounts(id),
  admin_payout_account_id uuid references public.admin_payout_accounts(id),
  disbursement_id text,
  gross_amount integer not null,
  fee_amount integer not null default 0,
  net_amount integer not null,
  currency text not null default 'XAF',
  status text not null default 'pending'
    check (status in ('pending','ready','processing','paid','failed','cancelled','manual_review')),
  provider_transfer_reference text,
  provider_transfer_status text,
  raw_transfer_request jsonb,
  raw_transfer_response jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Regles:

- une ligne `merchant` pour le montant net boutique;
- une ligne `platform` pour la commission si elle doit etre sortie du wallet principal;
- aucune ligne `paid` sans confirmation provider;
- aucune tentative de reversement sans `disbursement_id` verifie.

## 5. Validation des numeros Airtel et Moov

Les boutiques et l'admin doivent pouvoir saisir des numeros mobile money eligibles Airtel et Moov.

Validation minimale cote application:

- normaliser le numero en format local et/ou international;
- supprimer espaces, tirets et caracteres visuels;
- refuser les numeros trop courts, trop longs ou non numeriques;
- demander l'operateur explicitement si le prefixe ne suffit pas;
- verifier que le numero est compatible avec l'operateur choisi;
- interdire deux comptes actifs identiques pour le meme beneficiaire;
- passer le compte en `pending` tant qu'il n'est pas verifie.

Validation operationnelle:

- l'admin verifie le numero;
- l'admin cree ou confirme le beneficiaire dans la section `Transfer` du wallet SingPay;
- Ouyaboung stocke le `Disbursement ID`;
- le compte passe a `verified`;
- seuls les comptes `verified` et `active` peuvent recevoir des reversements.

## 6. Flux d'initiation paiement

Le client transmet uniquement:

- `orderId`;
- `phone`;
- `operator`, si l'utilisateur force Airtel ou Moov.

Le client ne transmet pas:

- montant;
- wallet;
- `x-client-id`;
- `x-client-secret`;
- `x-wallet`;
- `disbursement_id`;
- commission;
- beneficiaire.

L'Edge Function:

1. authentifie l'utilisateur;
2. charge la commande;
3. verifie que la commande appartient a l'utilisateur;
4. verifie que la commande est `pending`;
5. charge le produit et la boutique;
6. charge le wallet principal SingPay actif;
7. lit `orders.total_price` comme source de verite;
8. cree une ligne `payment_transactions`;
9. appelle SingPay avec le wallet principal;
10. conserve la reponse brute et l'identifiant provider.

Base URL:

```text
https://gateway.singpay.ga/v1
```

Endpoints:

- Airtel Money: `POST /74/paiement`;
- Moov Money: `POST /62/paiement`;
- Maviance: `POST /maviance/paiement`;
- paiement externe heberge: `POST /ext`.

Headers serveur:

```http
x-client-id: <client_id du wallet principal>
x-client-secret: <client_secret du wallet principal>
x-wallet: <wallet_id principal>
```

Body minimal pour Airtel/Moov:

```json
{
  "amount": 2500,
  "reference": "OYB-ORDER-...",
  "client_msisdn": "074...",
  "portefeuille": "<wallet_id principal>",
  "disbursement": "<disbursement_id si requis par SingPay>",
  "isTransfer": true
}
```

Point a clarifier avec SingPay:

- si `isTransfer=true` est obligatoire des l'initiation pour autoriser les reversements ulterieurs via `POST /transfer`;
- si `disbursement` peut etre omis a l'initiation quand la repartition est faite plus tard;
- si plusieurs reversements peuvent etre attaches a une seule transaction.

## 7. Flux callback paiement

Le callback doit:

1. verifier la signature, le secret provider ou le mecanisme officiel fourni par SingPay;
2. retrouver `payment_transactions.internal_reference`;
3. verifier que le montant, le wallet principal et le statut correspondent;
4. passer la transaction interne a `confirmed` uniquement si SingPay termine avec `Success`;
5. passer la commande a `confirmed`;
6. creer les lignes `payment_settlements`;
7. ne jamais confirmer une commande inconnue ou deja traitee.

Mapping de confirmation:

- `Terminate + Success`: paiement confirme;
- `PasswordError`: echec paiement;
- `BalanceError`: echec paiement;
- `TimeOutError`: expiration ou echec;
- `Error`: echec;
- `Start` ou `Partenaire`: attente.

## 8. Flux reversement dynamique

Apres confirmation du paiement:

1. calculer la commission plateforme;
2. calculer le montant net marchand;
3. selectionner le `merchant_payout_account` par defaut de la boutique;
4. verifier que le compte est `verified`, `active` et possede un `disbursement_id`;
5. creer une ligne `payment_settlements` en `ready`;
6. appeler `POST /transfer` quand la transaction SingPay le permet;
7. passer le settlement a `paid` uniquement apres reponse provider favorable;
8. en cas d'echec, garder la ligne en `failed` ou `manual_review`.

Endpoint SingPay:

```http
POST /transfer
x-client-id: <client_id du wallet principal>
x-client-secret: <client_secret du wallet principal>
x-wallet: <wallet_id principal>
```

Body:

```json
{
  "reference": "REFERENCE_TRANSACTION_SINGPAY_OU_OUYABOUNG",
  "disbursement": "DISBURSEMENT_ID_BENEFICIAIRE",
  "amount": 2250
}
```

Regle d'idempotence:

> Une ligne `payment_settlements` ne doit jamais declencher deux reversements payes pour le meme montant, la meme transaction et le meme `disbursement_id`.

## 9. Securite

Principes obligatoires:

- SingPay reste serveur uniquement;
- le wallet principal n'est jamais visible cote client;
- les `Disbursement ID` ne sont jamais choisis par le client;
- aucun montant ne vient du client;
- aucune confirmation n'est acceptee sans transaction initiee;
- aucun reversement n'est execute sans settlement interne;
- les callbacks sans secret valide sont refuses en production;
- les logs redactent les secrets et les numeros complets;
- les comptes de payout sont visibles uniquement par leur proprietaire et par les admins;
- les admins seuls peuvent valider ou desactiver un compte de payout.

## 10. RLS et droits

Recommandations:

- les marchands peuvent lire et proposer leurs propres numeros de payout;
- les marchands ne peuvent pas definir eux-memes `verified`, `disbursement_id` ou `is_active`;
- les admins peuvent valider, rejeter et desactiver les comptes de payout;
- les clients ne lisent jamais les comptes paiement;
- les Edge Functions utilisent le service role pour les operations serveur controlees;
- les tables de ledger et de settlement sont append-only autant que possible.

## 11. Migration progressive proposee

### Phase 1 - Documentation et schema

- documenter le modele wallet principal + reversements;
- creer `platform_payment_wallets`;
- creer `merchant_payout_accounts`;
- creer `admin_payout_accounts`;
- creer `payment_transactions`;
- creer `payment_settlements`;
- ajouter les policies RLS.

### Phase 2 - Back-office marchand et admin

- permettre aux boutiques de saisir leurs numeros Airtel/Moov;
- permettre a l'admin de saisir ses numeros Airtel/Moov;
- ajouter validation admin;
- stocker le `Disbursement ID` apres creation ou verification dans SingPay.

### Phase 3 - Edge Functions SingPay

- creer un adaptateur serveur `SingPayProvider`;
- modifier `initiate-payment`;
- modifier `initiate-airtel`;
- modifier `initiate-moov`;
- modifier les callbacks;
- creer le service de settlement;
- ajouter idempotence callback et idempotence transfer.

### Phase 4 - Production controlee

- configurer le wallet principal;
- configurer la callback URL;
- verifier les beneficiaires pilotes;
- tester un paiement Airtel;
- tester un paiement Moov;
- tester un reversement marchand;
- tester un echec de reversement;
- activer progressivement les boutiques.

## 12. Impact sur le code actuel

Fichiers probablement concernes:

- `src/services/payment.service.ts`;
- `supabase/functions/initiate-payment/index.ts`;
- `supabase/functions/initiate-airtel/index.ts`;
- `supabase/functions/initiate-moov/index.ts`;
- `supabase/functions/payment-callback/index.ts`;
- `supabase/functions/airtel-callback/index.ts`;
- `supabase/functions/moov-callback/index.ts`;
- `app/(dashboard)/merchant/settings/page.tsx`;
- `app/(dashboard)/admin/transactions/page.tsx`;
- `app/(dashboard)/admin/merchants/page.tsx`;
- nouveau dashboard admin des payouts;
- `DEPLOYMENT.md`;
- `.env.example`.

## 13. Questions bloquantes SingPay avant code production

Avant d'implementer le remplacement effectif du paiement, il faut clarifier:

1. `POST /transfer` attend-il la reference marchand ou l'identifiant SingPay?
2. `isTransfer=true` est-il obligatoire au moment du paiement pour autoriser un transfer ulterieur?
3. Le champ `disbursement` du paiement est-il obligatoire si le transfer est dynamique apres paiement?
4. Peut-on effectuer plusieurs transfers pour une meme transaction?
5. Comment creer un beneficiaire `Transfer` par API, ou faut-il le faire dans le dashboard SingPay?
6. Le `Disbursement ID` est-il stable dans le temps?
7. Quels formats exacts de numeros Airtel et Moov sont acceptes?
8. Comment verifier qu'un numero est eligible mobile money avant reversement?
9. Le callback est-il signe?
10. Quels sont tous les codes de succes/echec pour paiement et transfer?

## 14. Decision pour le chantier actuel

Le socle paiement SingPay marketplace est implemente dans ce lot.

Ce qui est implemente:

- migration `20260620190000_singpay_marketplace_payments.sql`;
- tables `platform_payment_wallets`, `merchant_payout_accounts`, `admin_payout_accounts`, `payment_transactions`, `payment_settlements`;
- Edge Functions `initiate-airtel`, `initiate-moov`, `initiate-payment` branchees sur SingPay;
- callback `payment-callback` branche sur SingPay;
- aliases `airtel-callback` et `moov-callback` conserves;
- ledger de settlement marchand apres paiement confirme;
- garde-fou `SINGPAY_TRANSFERS_ENABLED=false` par defaut pour eviter les reversements reels avant validation;
- variables d'environnement ajoutees dans `.env` et `.env.example`.

Ce qui reste a finaliser avant production:

- renseigner `SINGPAY_CLIENT_ID` et `SINGPAY_CLIENT_SECRET`;
- confirmer le mecanisme d'authentification callback SingPay;
- creer ou verifier les beneficiaires `Transfer` dans le dashboard SingPay;
- renseigner les `Disbursement ID` dans `merchant_payout_accounts`;
- tester un paiement reel Airtel;
- tester un paiement reel Moov;
- tester `POST /transfer` avec `SINGPAY_TRANSFERS_ENABLED=true` seulement apres validation.
