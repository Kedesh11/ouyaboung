# Integration PVIT (paiement Mobile Money fractionne)

Statut: code implemente et teste (simulation), **non encore recette contre l'API PVIT reelle**.
Documentation fournisseur: https://docs.mypvit.pro/fr (paiement fractionne: `/fr/api/split-payment`).

## 1. Principe

Chaque client paie sa commande, et le paiement est reparti **dans la meme transaction** vers
la boutique qui possede le produit:

```text
client --(Airtel/Moov)--> compte d'operation Ouyaboung --split--> boutique (net)
                                                         \-> reste: commission plateforme
```

Ouyaboung est le commercant enregistre chez PVIT (un seul compte d'operation). Le client ne paie
donc pas directement la boutique: le paiement transite par le compte d'operation, ce qui permet
la commission et le suivi. Il n'y a **plus d'etape de reversement differe**: la repartition est
decidee et executee par PVIT a l'encaissement.

## 2. Flux

1. **Initiation** (`initiate-payment`, JWT utilisateur). Le client n'envoie que `orderId`, `phone`
   et `operator`. Le serveur lit la commande (montant = `orders.total_price`), verifie
   l'appartenance, le statut `pending`, la limite de tentatives (5 / 10 min / utilisateur) et
   l'absence de paiement en cours (5 min / commande), puis exige un compte de reversement
   **verifie** pour la boutique. Il calcule la commission (`PLATFORM_COMMISSION_RATE`, 10 % par
   defaut), cree les lignes de ledger (`initiated`) et appelle PVIT. Reponse PVIT acceptee =
   statut `pending` (l'initiation ne confirme jamais rien).
2. **Confirmation du client** sur son telephone (USSD).
3. **Webhook** (`pvit-callback`, sans JWT). PVIT notifie `SUCCESS` ou `FAILED`. Le callback n'est
   qu'un indice: le serveur interroge l'**API de statut PVIT** et applique ce que PVIT repond.
   Si PVIT confirme: paiement `confirmed`, commande `confirmed`, ledger de repartition ecrit.
   Le serveur repond `{transactionId, responseCode}` en renvoyant dynamiquement les valeurs recues
   (exige par PVIT).
4. **Rattrapage** (`pvit-transaction-status`): si aucun callback n'arrive, le client, la boutique
   ou un admin peut resynchroniser (bouton dans les pages transactions). Meme logique que le
   callback.
5. **Verification des numeros** (`verify-payout-account`): a l'ajout d'un numero de reversement,
   la boutique est verifiee par l'API KYC de PVIT. Seule cette fonction peut passer un compte a
   `verified` (la RLS l'interdit au marchand).

## 3. Constats sandbox et hypotheses restantes

### Verifie contre l'API de test (22/11/2026)

Ces points ont ete testes en reel (compte d'operation de test) et corrigent ou precisent la
documentation PVIT:

| Sujet | Constat | Effet sur le code |
|-------|---------|-------------------|
| Numero du beneficiaire | Format **local avec zero** (`077123456`). Le format international de l'exemple de la doc (`24177123456`) est refuse: `3032 INVALID_BENEFICIARY_ACCOUNT_NUMBER` | `buildSplitPayload` envoie `normalized_msisdn` tel quel |
| `free_info` | Uniquement lettres, chiffres, tirets et espaces, **15 caracteres maximum**, sinon `422 CONSTRAINT_VIOLATION` | `sanitizeFreeInfo` (`order` + 8 premiers caracteres de la commande) |
| API de statut | La transaction est retrouvee par **notre reference marchande** (`merchant_reference_id`); l'identifiant PVIT (`PAY...`) renvoye a l'initiation donne `4006 TRANSACTION_NOT_FOUND` | Verification par reference, identifiant PVIT en repli |
| Format d'erreur | `{ "status_code": 3032, "error": "...", "message": "..." }` (et non `code`) | `providerErrorCode` lit `status_code` puis `code` |
| Codes operateur | `AIRTEL_MONEY` et `MOOV_MONEY` (via `get-operators?country-code=GA`) | Aucun changement |
| Split accepte | Split `FIXED` a un beneficiaire accepte, initiation `PENDING`, statut final `SUCCESS` (montant 150, frais 3,75) | — |
| Reste du split | **Confirme**: le reste revient au compte d'operation. Pour un paiement de 150 XAF avec 135 verses a la boutique, le solde du compte de test augmente de 9,76 XAF = 15 (reste) - 3,75 (frais PVIT) - 1,5 (frais operateur) | Aucun: la commission reste bien sur le compte d'operation |
| Frais PVIT | Avec `owner_charge: MERCHANT`, les frais (3,75 + 1,5 sur 150) sont **preleves sur la commission** de la plateforme, pas sur le client ni sur la boutique | Garder `MERCHANT` (le client paie exactement le prix affiche) ou passer a `CUSTOMER` |
| Webhook / recette | L'espace PVIT affiche, par transaction, le « code attendu » (200) et le « code recu » = le `responseCode` que notre serveur a renvoye. Le « Recapitulatif des tests » ne compte un paiement que si ce code est acquitte correctement. Cas succes: code 200. Cas echec: code 2000 | `buildAck` renvoie `{transactionId, responseCode}` en echo |
| KYC | Reponse `{"data":{"firstname":"..."}}`. En sandbox il repond toujours un profil fictif (aucun cas d'echec observable); fonctionne meme sans `X-Secret` | Parsing `data` |
| Secret | `renew-secret` renvoie `{operation_account_code, secret: "sk_test_...", expires_in: 3600}` | — |

### Recette sandbox PVIT (22/11/2026)

- 2 paiements succes (150 XAF) et 2 paiements echec (1 500 XAF, code 2000) initiés par `initiate-payment` sur de vraies commandes, webhooks acquittes: le « Recapitulatif des tests » de l'espace PVIT affiche **2/2 pour chaque cas**.
- Verification KYC d'un numero de reversement (`verify-payout-account`) testee en reel: le compte passe a `verified`; la boutique ne peut pas se verifier elle-meme via l'API REST (RLS).
- Reste cote PVIT pour la production: finaliser la configuration du compte marchand (profil, documents) puis creer les comptes d'operation de production.

### Hypotheses encore a valider

| Sujet | Choix retenu | A verifier |
|-------|--------------|------------|
| Resultat par beneficiaire | La ligne boutique du ledger passe a `paid` quand le statut global est `SUCCESS` | Pas de statut par beneficiaire dans l'API: croiser avec le reporting PVIT |
| Webhook reel | **Valide de bout en bout** (22/11/2026, fonctions deployees): paiement `pending` -> webhook PVIT recu -> statut reverifie aupres de PVIT -> paiement et commande `confirmed` (~5 s), ledger boutique/plateforme ecrit. Cas echec: paiement `failed`, commande `pending`, aucun reversement | Adresse source (`X-Forwarded-For`) a verifier avant de passer `PVIT_CALLBACK_IP_MODE` a `enforce` |
| Remboursement | Non gere (`GIVE_CHANGE` independant de la transaction d'origine) | Faisabilite d'annuler un split |
| Reference | `OYB` + 8 car. de la commande + 8 car. = 19 caracteres, alphanumerique | — (accepte par PVIT) |

## 3bis. Paiement des transports (agriculteur -> chauffeur)

Meme mecanique de paiement fractionne, mais **isolee** des commandes de produits: une
fonction dediee (`initiate-transport-payment`, code dans `_shared/pvit-transport.ts`) appelee
uniquement quand l'agriculteur clique sur « Payer la course ». Rien n'est declenche
automatiquement. Les utilitaires communs (config, secret, appels PVIT, verification du statut)
sont dans `_shared/pvit-runtime.ts`; le flux des commandes n'est pas modifie.

```text
agriculteur --(Airtel/Moov)--> compte d'operation Ouyaboung --split--> chauffeur (net)
                                                              \-> reste: commission plateforme
```

1. Le chauffeur accepte une demande (il doit avoir un numero Mobile Money **verifie**, table
   `driver_payout_accounts`, meme KYC que les boutiques via `verify-payout-account`).
2. L'agriculteur dispose de `transport_settings.payment_window_minutes` (15 par defaut,
   modifiable par l'admin) pour payer. Passe ce delai sans paiement, la course est annulee et
   le chauffeur libere (traitement a la demande, sans tache planifiee).
3. `initiate-transport-payment` n'accepte que `requestId`, `phone` et `operator`. **Le montant,
   la commission et la part du chauffeur sont ceux figes sur la demande** (tarif admin au moment
   de la commande), jamais `PLATFORM_COMMISSION_RATE` ni une valeur du client.
4. Confirmation par le webhook `pvit-callback` (reference inconnue des commandes -> recherchee
   dans `transport_payments`) ou par la synchronisation `pvit-transaction-status`: dans les deux
   cas le statut est **toujours reverifie aupres de l'API PVIT**, avec controle du montant.
5. Course payee -> le chauffeur peut marquer « marchandise chargee » (refuse avant).

Garde-fous: un seul paiement actif par course (index unique), limitation des tentatives,
paiement echoue -> la course repasse a `unpaid` (nouvel essai dans le delai), course payee non
annulable par l'agriculteur (aucun remboursement automatique: le support traite ces cas), paiement
confirme sur une course deja annulee -> `settlement_status = manual_review` (log `REFUND_REQUIRED`).
Un chauffeur sans numero verifie n'est ni propose sur la carte, ni attribuable, ni capable
d'accepter.

Deploiement: `supabase functions deploy initiate-transport-payment pvit-callback pvit-transaction-status verify-payout-account`
(les trois dernieres evoluent pour reconnaitre les transports) et la migration
`20261122150000_transport_payments.sql`. Aucune variable d'environnement nouvelle.

Pas encore recette contre l'API reelle: le comportement est valide par des tests (fausse API PVIT
et base locale); un paiement sandbox transport reste a faire avant la production.

## 4. Securite

- Secrets PVIT uniquement cote Edge Functions (`supabase secrets set`). Le secret `X-Secret`
  (valide 3600 s) est renouvele automatiquement et partage entre instances via la table
  `payment_provider_secrets` (RLS sans politique: seul `service_role` y accede).
- Webhook non signe par PVIT: statut **toujours** reverifie aupres de PVIT, montant exige et
  compare, controle de l'adresse source (`PVIT_CALLBACK_IP_MODE`). Voir R2 dans
  `docs/RISKS_TRACKING.md`.
- `pvit-callback` est deploye sans verification JWT (`verify_jwt = false`, `supabase/config.toml`).
- Toute ecriture en base est verifiee (reponse 500 sinon); les confirmations sont idempotentes et
  rejouables. Un paiement confirme pour une commande annulee est place en `manual_review`.
- La table `orders` n'est plus modifiable librement par les clients API (R16): `confirmed` est
  reserve au paiement.

## 5. Mise en service

### 5.1 Cote PVIT (espace marchand)

1. Creer le compte marchand, completer le profil, recuperer le compte d'operation **TEST** (`ACC_...`).
2. Menu **APIs**: definir le mot de passe de renouvellement du secret, noter le « Code URL » de
   chaque API (secret, paiement, statut, KYC).
3. Menu **Urls**: ajouter une URL de type *Callback*:
   `https://<project-ref>.supabase.co/functions/v1/pvit-callback` (localhost refuse), noter son code.

### 5.2 Cote Supabase

```bash
supabase secrets set \
  PVIT_OPERATION_ACCOUNT_CODE=ACC_xxx PVIT_SECRET_PASSWORD=... \
  PVIT_CODE_URL_SECRET=... PVIT_CODE_URL_PAYMENT=... PVIT_CODE_URL_STATUS=... PVIT_CODE_URL_KYC=... \
  PVIT_CALLBACK_URL_CODE=... PLATFORM_COMMISSION_RATE=0.10
supabase db push          # migration 20261121110000_payment_provider_secrets.sql
supabase functions deploy initiate-payment pvit-callback pvit-transaction-status verify-payout-account
```

Puis activer le paiement dans l'application: `NEXT_PUBLIC_PAYMENT_FLOW_ENABLED=true` (variable
Vercel, a definir au build).

### 5.3 Recette sandbox (exigee par PVIT avant la production)

- [ ] Au moins 2 paiements en succes (montant < 1000 XAF), callback acquitte (reponse avec echo dynamique de `transactionId` et `code`).
- [ ] Au moins 2 paiements en echec (montant > 1000 XAF force l'echec en sandbox), callback acquitte.
- [ ] API KYC fonctionnelle (ajout d'un numero de reversement -> `verified`).
- [ ] API de statut fonctionnelle (bouton de synchronisation, ou callback volontairement non recu).
- [ ] Verifier les hypotheses du §3 (reste du split, frais, `msisdn_type`, code Moov).
- [ ] Verifier la presence de l'adresse PVIT en derniere position de `X-Forwarded-For`, puis passer `PVIT_CALLBACK_IP_MODE=enforce`.

### 5.4 Production

Faire valider le profil marchand par PVIT, creer les comptes d'operation de production (un par
groupe d'operateurs), remplacer les codes/secrets, declarer l'URL de callback de production,
puis activer boutique par boutique (une boutique sans compte de reversement verifie ne peut pas
etre payee).

## 6. Fichiers

| Fichier | Role |
|---------|------|
| `supabase/functions/_shared/pvit-core.ts` | Logique pure: reference, split, statuts, parsing, ack, controle IP |
| `supabase/functions/_shared/pvit-runtime.ts` | Utilitaires communs: config, secret X-Secret, appels PVIT, verification du statut |
| `supabase/functions/_shared/pvit-transport.ts` | Paiement des transports (initiation, confirmation, synchronisation) |
| `supabase/functions/_shared/pvit.ts` | Handlers: secret, initiation, callback, synchronisation, KYC |
| `supabase/functions/_shared/payment-guards.ts` | Transitions de statut, controle du montant, fenetres de tentatives |
| `supabase/functions/{initiate-payment,pvit-callback,pvit-transaction-status,verify-payout-account}` | Points d'entree |
| `supabase/migrations/20261121110000_payment_provider_secrets.sql` | Cache du secret PVIT |
| `src/services/payment.service.ts`, `payout.service.ts`, `payment-transactions.service.ts` | Clients front |
| `supabase/functions/_shared/pvit-core.test.ts`, `src/__tests__/pvit-handlers.test.ts` | Tests (95) |
