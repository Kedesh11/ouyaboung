# Analyse rigoureuse de l'API SingPay

Date d'analyse: 20 juin 2026  
Source analysee: `https://client.singpay.ga/doc/reference/index.html`  
Schema Swagger: `https://client.singpay.ga/doc/reference/src/swagger.json`  
Version Swagger: `2.0`  
Host API: `gateway.singpay.ga`  
Base path: `/v1`

## 1. Synthese executive

La documentation SingPay expose une API REST de paiement mobile money centree sur les concepts suivants:

- **Portefeuille**: compte marchand ou espace d'encaissement SingPay.
- **Paiement**: initiation d'un paiement mobile money via Airtel, Moov, Maviance ou interface externe.
- **Transaction**: consultation et suivi d'une transaction initiee.
- **Transfer**: redistribution d'une partie du montant d'une transaction vers un compte mobile money, lorsque la transaction est configuree avec `isTransfer = true`.

Pour Ouyaboung, cette API est compatible avec l'architecture cible marketplace, a condition de separer clairement:

- le portefeuille principal qui encaisse les paiements;
- les beneficiaires de reversement Airtel/Moov;
- le ledger interne qui calcule et audite la repartition.

Point central:

> Dans SingPay, le champ et header structurants sont `x-wallet` et `portefeuille`. Pour Ouyaboung, ils doivent pointer vers le portefeuille principal de la plateforme au moment de l'encaissement.

La capture du portefeuille SingPay montre que la redistribution repose sur la section `Transfer`, ou chaque beneficiaire possede:

- un libelle;
- un numero de telephone;
- un operateur Airtel ou Moov;
- un `Disbursement ID`.

Donc, pour chaque boutique Ouyaboung, il faudra stocker au minimum:

- un numero mobile money eligible;
- un operateur `airtel` ou `moov`;
- un `disbursement_id` SingPay apres verification;
- un statut de validation interne.

Pour la plateforme, il faudra stocker:

- le `wallet_id` principal;
- le `client_id`;
- le `client_secret`;
- la callback URL;
- les numeros marchands Airtel/Moov si SingPay les exige pour l'encaissement.

Le client final ne doit jamais transmettre ces valeurs. Elles doivent etre resolues cote serveur depuis:

```text
order -> food_item -> merchant -> merchant_payout_account
```

## 2. Acces a la documentation

La page Swagger charge le fichier:

```text
./src/swagger.json
```

L'analyse a ete faite sur le JSON officiel, pas seulement sur l'interface Swagger UI.

Les identifiants Workspace fournis n'ont pas ete necessaires pour lire cette documentation de reference, car le fichier Swagger etait accessible publiquement au moment de l'analyse.

## 3. Informations OpenAPI/Swagger

Le schema declare:

```json
{
  "swagger": "2.0",
  "host": "gateway.singpay.ga",
  "basePath": "/v1",
  "schemes": ["https", "http"]
}
```

URL de base recommandee pour production:

```text
https://gateway.singpay.ga/v1
```

Attention:

- le Swagger declare aussi `http`;
- pour Ouyaboung, il faut interdire HTTP et utiliser uniquement HTTPS;
- aucune section `securityDefinitions` n'est declaree, mais tous les endpoints critiques exigent des headers d'authentification.

## 4. Authentification

Les endpoints utilisent une authentification par headers:

```http
x-client-id: <OAuth 2.0 client_id>
x-client-secret: <OAuth 2.0 client_secret>
x-wallet: <Wallet ID du portefeuille>
```

Tous les endpoints n'exigent pas `x-wallet`.

### 4.1 Headers constants

`x-client-id`:

- obligatoire presque partout;
- decrit comme `Oauth 2.0 client_id`.

`x-client-secret`:

- obligatoire presque partout;
- decrit comme `Oauth 2.0 client_secret`.

`x-wallet`:

- obligatoire pour les paiements;
- obligatoire pour certaines recherches de transactions;
- obligatoire pour les transfers;
- correspond au wallet ID du portefeuille.

### 4.2 Implication pour Ouyaboung

Il faut eviter deux erreurs opposees:

- exposer une configuration globale au frontend;
- creer artificiellement un wallet complet par boutique alors que le portefeuille principal peut encaisser puis reverser.

Modele recommande:

```text
platform_payment_wallets
  provider = singpay
  wallet_id
  client_id
  client_secret_encrypted
  callback_url
  is_active

merchant_payout_accounts
  merchant_id
  provider = singpay
  operator = airtel | moov
  msisdn
  normalized_msisdn
  disbursement_id
  verification_status
  is_default

admin_payout_accounts
  provider = singpay
  operator = airtel | moov
  msisdn
  normalized_msisdn
  disbursement_id
  verification_status
  is_verified
```

Selon la facon dont SingPay gere les beneficiaires `Transfer`:

- soit les beneficiaires sont crees manuellement dans le dashboard SingPay, puis Ouyaboung stocke le `Disbursement ID`;
- soit SingPay fournit un endpoint de creation de beneficiaire non visible dans le Swagger actuel;
- soit le champ `disbursement` accepte un identifiant deja cree dans le portefeuille principal.

Ce point devra etre confirme dans le Workspace SingPay avant le code de production.

## 5. Endpoints disponibles

## 5.1 Portefeuille

### GET `/portefeuille/api/{id}`

Objectif:

- recuperer les informations d'un portefeuille.

Parametres:

- `id` path, requis: Wallet ID du portefeuille;
- `x-client-id` header, requis;
- `x-client-secret` header, requis.

Reponse 200:

- schema `portefeuille`.

Usage Ouyaboung:

- verifier que le wallet principal existe;
- verifier son `callbackURL`;
- synchroniser les metadonnees du portefeuille principal.

### PUT `/portefeuille/api/{id}`

Objectif:

- modifier l'URL de callback d'un portefeuille.

Parametres:

- `id` path, requis;
- body `callbackURL`, requis;
- `x-client-id` header, requis;
- `x-client-secret` header, requis.

Body:

```json
{
  "callbackURL": "https://..."
}
```

Usage Ouyaboung:

- configurer une URL callback unique par environnement;
- verifier que le wallet principal pointe vers l'Edge Function de callback Ouyaboung.

Attention:

- l'endpoint ne documente pas les codes d'erreur.

## 5.2 Paiement Airtel Money

### POST `/74/paiement`

Objectif:

- lancer un USSD Push Airtel Money chez le client.

Headers requis:

```http
x-client-id
x-client-secret
x-wallet
```

Body `paiement`:

```json
{
  "amount": 1000,
  "reference": "ORDER-REFERENCE",
  "client_msisdn": "074...",
  "portefeuille": "WALLET_ID",
  "disbursement": "DISTRIBUTION_ID",
  "isTransfer": false
}
```

Champs:

- `amount`: montant XAF;
- `reference`: reference unique generee par le marchand;
- `client_msisdn`: numero Airtel Money du client;
- `portefeuille`: Wallet ID;
- `disbursement`: distribution vers laquelle rediriger les fonds, obligatoire en production selon la doc;
- `isTransfer`: activer les transfers sur cette transaction.

Reponse 200:

- schema `paiementResult`;
- contient `transaction`;
- contient `status`.

Usage Ouyaboung:

- chemin nominal pour Airtel;
- la reference doit etre generee cote serveur;
- le montant doit venir de `orders.total_price`;
- le wallet doit venir de la boutique.

## 5.3 Paiement Moov Money

### POST `/62/paiement`

Objectif:

- lancer un USSD Push Moov Money.

Contrat:

- identique a `/74/paiement`;
- le body reutilise le schema `paiement`;
- `client_msisdn` designe le numero mobile money du client.

Usage Ouyaboung:

- chemin nominal pour Moov;
- choisir cet endpoint apres validation du numero Moov;
- conserver le meme modele de transaction interne que pour Airtel.

## 5.4 Paiement Maviance

### POST `/maviance/paiement`

Objectif:

- lancer un paiement mobile money via Maviance.

Headers requis:

```http
x-client-id
x-client-secret
x-wallet
```

Body `paiementMaviance`:

```json
{
  "amount": 1000,
  "reference": "ORDER-REFERENCE",
  "client_msisdn": "077...",
  "portefeuille": "WALLET_ID",
  "disbursement": "DISTRIBUTION_ID",
  "mavianceServiceNumber": "MNT",
  "isTransfer": false
}
```

Champ specifique:

- `mavianceServiceNumber`: numero/service Maviance, exemples documentes: `MNT`, `ORANGE`.

Usage Ouyaboung:

- a considerer si le produit doit supporter d'autres rails que Airtel/Moov;
- peut rester hors scope initial.

## 5.5 Interface de paiement externe

### POST `/ext`

Objectif:

- recuperer un lien vers l'interface de paiement externe SingPay.

Headers requis:

```http
x-client-id
x-client-secret
x-wallet
```

Body `ext`:

```json
{
  "portefeuille": "WALLET_ID",
  "reference": "ORDER-REFERENCE",
  "redirect_success": "https://...",
  "redirect_error": "https://...",
  "amount": 1000,
  "disbursement": "DISTRIBUTION_ID",
  "logoURL": "https://...",
  "isTransfer": false
}
```

Reponse:

```json
{
  "link": "https://...",
  "exp": "..."
}
```

Usage Ouyaboung:

- alternative au USSD Push;
- utile si l'on veut rediriger l'utilisateur vers une page SingPay;
- moins integre que le paiement in-app, mais potentiellement plus simple pour certains moyens de paiement.

## 5.6 Suivi transaction par statut

### GET `/transaction/api/status/{id}`

Objectif:

- verifier le statut d'une transaction.

Parametres:

- `id` path: ID SingPay de la transaction;
- `x-client-id`;
- `x-client-secret`.

Reponse:

- schema `transactionStatus`.

Usage Ouyaboung:

- polling serveur en cas de callback manquant;
- reconciliation manuelle;
- verification avant de confirmer une commande si le callback est ambigu.

## 5.7 Recuperation transaction par ID

### GET `/transaction/api/{id}`

Objectif:

- recuperer les informations completes d'une transaction.

Parametres:

- `id` path: transaction ID;
- `x-client-id`;
- `x-client-secret`.

Reponse:

- schema `transaction`.

Usage Ouyaboung:

- support;
- reconciliation;
- audit.

## 5.8 Recherche transaction par reference

### GET `/transaction/api/search/by-reference/{reference}`

Objectif:

- recuperer une transaction via sa reference marchand.

Parametres:

- `reference` path;
- `x-client-id`;
- `x-client-secret`;
- `x-wallet`.

Usage Ouyaboung:

- essentiel pour l'idempotence;
- permet de retrouver une transaction a partir de notre reference interne;
- la reference doit etre unique par commande ou tentative de paiement.

## 5.9 Recherche transactions par portefeuille

### GET `/transaction/api/search/by-portefeuille/{id}`

Objectif:

- recuperer toutes les transactions d'un portefeuille.

Parametres:

- `id` path: id portefeuille;
- `x-client-id`;
- `x-client-secret`;
- `x-wallet`.

Usage Ouyaboung:

- reconciliation par boutique;
- back-office admin;
- diagnostic paiement.

## 5.10 Transfers

### GET `/transfer/transaction/{reference}`

Objectif:

- recuperer la liste des transfers d'une transaction.

Parametres:

- `reference` path;
- `x-client-id`;
- `x-client-secret`.

### POST `/transfer`

Objectif:

- transferer une partie du montant d'une transaction reussie vers un compte mobile money enregistre dans le tableau de distribution du portefeuille.

Condition:

- la transaction doit avoir ete configuree avec `isTransfer = true`.

Headers:

```http
x-client-id
x-client-secret
x-wallet
```

Body `createTransfer`:

```json
{
  "reference": "TRANSACTION_REFERENCE",
  "disbursement": "DISTRIBUTION_ID",
  "amount": 500
}
```

Usage Ouyaboung:

- peut servir a une strategie marketplace;
- a ne pas utiliser au hasard dans le flux initial;
- necessite de clarifier le modele de revenus:
  - encaissement direct boutique;
  - encaissement plateforme puis transfert;
  - split/distribution SingPay.

## 6. Modeles de donnees importants

## 6.1 `transaction`

Champs clefs:

- `status`: etape de la requete;
- `result`: resultat final;
- `airtel_money_id`: present si succes Airtel;
- `amount`;
- `portefeuille`;
- `client_msisdn`;
- `id`: reference SingPay de la transaction;
- `reference`: reference marchand;
- `created_at`;
- `updated_at`.

Valeurs documentees pour `status`:

- `Start`;
- `Partenaire`;
- `Terminate`;
- `Disbursement`;
- `Refund`.

Valeurs documentees pour `result`:

- `Success`;
- `PasswordError`;
- `BalanceError`;
- `TimeOutError`;
- `Error`.

Mapping Ouyaboung recommande:

| SingPay `status` | SingPay `result` | Transaction interne | Commande |
|---|---|---|---|
| `Start` | absent | `initiated` ou `pending` | `pending` |
| `Partenaire` | absent | `pending` | `pending` |
| `Terminate` | `Success` | `confirmed` | `confirmed` |
| `Terminate` | `PasswordError` | `failed` | `pending` ou `payment_failed` si ajoute |
| `Terminate` | `BalanceError` | `failed` | `pending` ou `payment_failed` si ajoute |
| `Terminate` | `TimeOutError` | `expired` ou `failed` | `pending` |
| `Terminate` | `Error` | `failed` | `pending` |
| `Disbursement` | selon contexte | `confirmed` puis `disbursed` si ajoute | `confirmed` |
| `Refund` | selon contexte | `refunded` si ajoute | statut a definir |

## 6.2 `paiementResult`

Contient:

- `transaction`;
- `status`.

`status` contient:

- `code`;
- `message`;
- `success`;
- `result_code`.

Attention:

- le Swagger ne liste pas les codes possibles;
- notre integration devra logger et cataloguer les codes reels observes en sandbox/production.

## 6.3 `portefeuille`

Champs utiles:

- `_id`;
- `id`;
- `nom`;
- `merchant_code`;
- `merchant_msisdn`;
- `callbackURL`;
- `status`;
- `sharing`.

Usage:

- `id` ou `_id` doit etre clarifie en test reel;
- le champ `callbackURL` permet de verifier ou configurer le webhook;
- `merchant_msisdn` peut aider a l'audit du wallet boutique.

## 7. Architecture Ouyaboung recommandee

## 7.1 Table `platform_payment_wallets`

Stocker le portefeuille principal SingPay qui recoit les encaissements:

```sql
platform_payment_wallets
  id uuid
  provider text -- singpay
  wallet_id text
  client_id text
  client_secret_encrypted text
  callback_url text
  airtel_merchant_number text
  airtel_merchant_code_encrypted text
  moov_merchant_number text
  is_active boolean
  created_at timestamptz
  updated_at timestamptz
```

## 7.2 Tables `merchant_payout_accounts` et `admin_payout_accounts`

Stocker les numeros mobile money eligibles et leurs `Disbursement ID`:

```sql
merchant_payout_accounts
  id uuid
  merchant_id uuid
  provider text -- singpay
  operator text -- airtel | moov
  label text
  msisdn text
  normalized_msisdn text
  disbursement_id text
  verification_status text -- pending | verified | rejected | disabled
  is_default boolean
  is_active boolean
  verified_by uuid
  verified_at timestamptz
```

La table admin suit la meme logique, mais sans `merchant_id`.

Pourquoi:

- les boutiques et admins saisissent des numeros Airtel/Moov, pas des secrets API;
- les admins valident l'eligibilite mobile money;
- le `Disbursement ID` lie Ouyaboung au beneficiaire de la section `Transfer` SingPay;
- les reversements restent auditables.

## 7.3 Table `payment_transactions`

Champs minimum:

```sql
payment_transactions
  id uuid
  order_id uuid
  merchant_id uuid
  platform_wallet_id uuid
  provider text -- singpay
  operator text
  internal_reference text
  provider_transaction_id text
  amount integer
  currency text -- XAF
  status text
  provider_status text
  provider_result text
  raw_initiation_response jsonb
  raw_callback jsonb
  created_at timestamptz
  updated_at timestamptz
```

Pourquoi:

- SingPay expose a la fois `id` et `reference`;
- nous devons garder notre reference interne et la reference SingPay;
- le callback doit etre idempotent;
- le support doit pouvoir auditer le cycle complet.

## 7.4 Table `payment_settlements`

Tracer la repartition apres paiement confirme:

```sql
payment_settlements
  id uuid
  payment_transaction_id uuid
  order_id uuid
  merchant_id uuid
  recipient_type text -- merchant | platform
  merchant_payout_account_id uuid
  admin_payout_account_id uuid
  disbursement_id text
  gross_amount integer
  fee_amount integer
  net_amount integer
  status text -- pending | ready | processing | paid | failed | manual_review
  provider_transfer_reference text
  raw_transfer_request jsonb
  raw_transfer_response jsonb
```

Cette table est essentielle parce que l'encaissement et le reversement sont deux operations differentes.

## 8. Flux d'initiation recommande

1. Le client choisit un produit.
2. Ouyaboung cree une commande `pending`.
3. L'utilisateur saisit son numero.
4. Le frontend appelle notre Edge Function, pas SingPay directement.
5. L'Edge Function charge:
   - la commande;
   - le produit;
   - la boutique;
   - le portefeuille principal SingPay.
6. L'Edge Function cree une reference interne unique:

```text
OYB-{orderIdCourt}-{attempt}
```

7. L'Edge Function appelle:
   - `/74/paiement` pour Airtel;
   - `/62/paiement` pour Moov;
   - ou `/ext` pour l'interface externe.
8. L'Edge Function enregistre la transaction interne.
9. La commande reste `pending` jusqu'a confirmation.
10. Aucun reversement n'est declenche avant confirmation du paiement.

## 8.1 Association produit et identifiant paiement

Le Swagger SingPay ne documente aucun endpoint produit. L'API ne permet donc pas d'enregistrer directement:

```text
product_id -> payment_id
```

L'association doit etre geree dans Ouyaboung:

```text
food_items.id -> merchants.id -> merchant_payout_accounts.id
orders.id -> payment_transactions.internal_reference
payment_transactions.id -> payment_settlements.id
```

SingPay fournit les briques suivantes:

- `reference`: reference marchand envoyee au moment du paiement;
- `transaction.id`: identifiant de transaction SingPay;
- `disbursement`: identifiant du beneficiaire de reversement;
- `POST /transfer`: reversement d'une partie du montant vers un beneficiaire.

Donc la bonne pratique est:

- stocker `product_id` et `merchant_id` dans la commande ou dans les lignes de commande;
- generer une `reference` Ouyaboung unique pour SingPay;
- conserver le lien entre `reference`, `order_id`, `product_id`, `merchant_id` et `settlement_id` dans notre base;
- ne jamais demander au frontend de transmettre un identifiant de paiement ou de reversement produit.

## 9. Flux callback recommande

Le Swagger ne documente pas le payload callback exact.

Donc notre integration doit etre defensive:

- accepter uniquement des callbacks authentifies;
- conserver le payload brut;
- retrouver la transaction par reference ou id;
- interroger SingPay si le payload callback est incomplet;
- confirmer la commande uniquement si:
  - transaction interne trouvee;
  - montant identique;
  - wallet principal identique;
  - resultat final `Success`.
- creer ensuite les lignes de settlement marchand et plateforme.

## 9.1 Flux de reversement recommande

Apres confirmation:

1. calculer la commission plateforme;
2. calculer le montant net marchand;
3. selectionner le compte de payout verifie de la boutique;
4. verifier la presence du `disbursement_id`;
5. creer une ligne `payment_settlements`;
6. appeler `POST /transfer` quand les preconditions SingPay sont respectees;
7. marquer le settlement `paid` uniquement apres confirmation provider.

## 10. Points faibles de la documentation Swagger

La documentation est exploitable mais incomplete.

Limites:

- Swagger 2.0 ancien;
- aucun `securityDefinitions`;
- tous les endpoints ne declarent que la reponse `200`;
- pas de schema d'erreur;
- pas de payload callback documente;
- pas de liste exhaustive des `status.code` et `result_code`;
- certains types Swagger sont invalides ou approximatifs (`type: json`, `type: application/json`);
- `http` est declare alors que l'integration doit utiliser HTTPS uniquement;
- `portefeuille` apparait a la fois dans le body et `x-wallet` pour les paiements.

Consequence:

- il faudra tester en environnement reel ou sandbox;
- il faudra journaliser les reponses provider;
- il faudra garder une couche d'adaptation robuste.

## 11. Questions a clarifier avec SingPay

Questions critiques avant implementation:

1. `POST /transfer` attend-il la reference marchand ou l'identifiant SingPay?
2. `isTransfer=true` est-il obligatoire des l'initiation du paiement pour autoriser un transfer ulterieur?
3. Le champ `disbursement` du paiement est-il obligatoire si le reversement est dynamique apres paiement?
4. Quel est le payload exact du callback?
5. Le callback est-il signe?
6. Comment verifier l'authenticite du callback?
7. Une reference marchand peut-elle etre rejouee?
8. Quelle est la duree d'expiration d'une transaction USSD Push?
9. Quels sont les codes possibles de `status.code` et `status.result_code`?
10. Quels formats exacts de numeros sont acceptes pour Airtel et Moov?
11. Comment verifier qu'un numero est eligible mobile money avant de le valider?
12. Comment creer un beneficiaire `Transfer` par API, ou faut-il le faire dans le dashboard SingPay?
13. Peut-on faire plusieurs transfers pour une seule transaction?
14. Le `Disbursement ID` est-il stable dans le temps?

## 12. Decision d'integration pour Ouyaboung

Decision recommandee:

- ne pas exposer SingPay au frontend;
- creer un adaptateur serveur `SingPayProvider`;
- utiliser le portefeuille principal Ouyaboung pour l'encaissement;
- stocker les numeros Airtel/Moov des boutiques et admins comme comptes de payout;
- stocker les `Disbursement ID` apres verification;
- conserver une table interne de transactions;
- conserver une table interne de settlements;
- utiliser `/74/paiement` et `/62/paiement` comme premiere integration;
- garder `/ext` comme alternative;
- utiliser `/transfer` uniquement via un service de settlement idempotent.

## 13. Prochain chantier technique

Etapes proposees:

1. creer migration `platform_payment_wallets`;
2. creer migration `merchant_payout_accounts`;
3. creer migration `admin_payout_accounts`;
4. creer migration `payment_transactions`;
5. creer migration `payment_settlements`;
6. ajouter RLS;
7. ajouter service serveur SingPay;
8. adapter Edge Functions init payment;
9. adapter callback;
10. ajouter service de settlement et transfer;
11. ajouter dashboard marchand pour numeros Airtel/Moov;
12. ajouter dashboard admin de validation;
13. ajouter tests unitaires de mapping statut;
14. ajouter tests d'idempotence callback et transfer.

## 14. Conclusion

SingPay est compatible avec notre besoin, mais l'integration doit etre traitee comme une integration marketplace serieuse.

Le point cle n'est pas seulement de remplacer Q-Gabon par SingPay. Il faut changer le modele de paiement:

```text
commande -> produit -> boutique -> wallet principal SingPay -> settlement -> transfer
```

La documentation et la structure du portefeuille confirment que le wallet principal encaisse, puis que les beneficiaires de la section `Transfer` recoivent les reversements via leur `Disbursement ID`.
