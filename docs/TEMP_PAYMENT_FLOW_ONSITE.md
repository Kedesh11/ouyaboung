# Flux paiement temporaire (onsite) - obsolete

> Statut: **obsolete depuis le durcissement du 20 juin 2026**.
> Le paiement mobile Q-Gabon est le flux nominal. Le scan QR ne doit plus confirmer un paiement sur place implicite et refuse les commandes `pending`.

## Contexte
- Date de mise en place: 27 fevrier 2026
- Objectif: neutraliser temporairement le paiement mobile (Airtel/Moov/Q-Gabon) sans casser le parcours commande.
- Regle temporaire: le client paye sur place, puis le marchand scanne le QR code pour valider le paiement/retrait.

## Elements neutralises
- Le paiement mobile est desactive par flag:
  - `src/services/payment.service.ts`
  - `export const PAYMENT_FLOW_ENABLED = false;`
- Les Edge Functions de paiement retournent un refus explicite si le flow est desactive:
  - `supabase/functions/initiate-payment/index.ts`
  - `supabase/functions/initiate-airtel/index.ts`
  - `supabase/functions/initiate-moov/index.ts`
  - `supabase/functions/airtel-callback/index.ts`
  - `supabase/functions/moov-callback/index.ts`
  - `supabase/functions/payment-callback/index.ts`

## Nouveau comportement temporaire
- Cote client:
  - Bouton `Payer` ouvre un modal "Paiement sur place (temporaire)" avec:
    - montant
    - nom/adresse/telephone marchand
    - coordonnees GPS (si disponibles) + lien carte
  - Fichiers:
    - `src/components/payment/PaymentModal.tsx`
    - `app/(dashboard)/user/reservations/page.tsx`

- QR Code client:
  - Le QR est affichable en `pending`, `confirmed`, `ready`.
  - Texte adapte pour indiquer paiement sur place + scan marchand.
  - Fichiers:
    - `app/(dashboard)/user/reservations/page.tsx`
    - `src/components/QRCodeModal.tsx`

- Validation scan marchand:
  - L'Edge Function `validate-qr` accepte `pending`, `confirmed`, `ready`.
  - Le scan marque la commande en `completed` (confirmation paiement/retrait).
  - `confirmed_at` est rempli si absent.
  - Fichier:
    - `supabase/functions/validate-qr/index.ts`

## Procedure de rollback (retour paiement mobile)
1. Reactiver le flag:
   - `src/services/payment.service.ts`
   - passer `PAYMENT_FLOW_ENABLED` a `true`
2. Remettre le bouton QR cote client uniquement selon la regle metier voulue (ex: `confirmed`/`ready`).
3. Retirer l'acceptation du statut `pending` dans:
   - `supabase/functions/validate-qr/index.ts`
4. Revenir au texte QR orienté "montant deja paye".
5. Verifier les callbacks paiement et les transactions avant remise en production.

## Verification rapide
- Client > reservations:
  - `Payer` ouvre le modal de paiement mobile Q-Gabon.
  - `Voir le QR Code` est disponible uniquement pour commandes `confirmed` ou `ready`.
- Marchand > scan:
  - Scan QR d'une commande `pending` => refus `INVALID_ORDER_STATUS`.
  - Scan QR d'une commande `confirmed` ou `ready` => commande passee `completed`.
