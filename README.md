# Ouyaboung - Plateforme Anti-Gaspillage Alimentaire

[![Next.js](https://img.shields.io/badge/Next.js-15.5-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue)](https://www.typescriptlang.org/)
[![Supabase](https://img.shields.io/badge/Supabase-Latest-green)](https://supabase.com/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> Connecter les commerçants et les consommateurs pour réduire le gaspillage alimentaire au Gabon

**Ouyaboung** est une marketplace qui permet aux commerces de proposer leurs invendus à prix réduit, aidant ainsi à lutter contre le gaspillage alimentaire tout en offrant des économies aux consommateurs.

## Table des Matières

- [Fonctionnalités](#fonctionnalités)
- [Architecture](#architecture)
- [Prérequis](#prérequis)
- [Installation](#installation)
- [Configuration](#configuration)
- [Démarrage](#démarrage)
- [Structure du Projet](#structure-du-projet)
- [Stack Technique](#stack-technique)
- [Paiement Mobile](#paiement-mobile)
- [Déploiement](#déploiement)
- [Tests](#tests)
- [Contribution](#contribution)
- [License](#license)

## Fonctionnalités

### Pour les Utilisateurs

- **Recherche intelligente** - Trouvez des produits disponibles près de chez vous
- **Réservation en ligne** - Réservez vos produits en quelques clics
- **Paiement Airtel Money** - Paiement mobile sécurisé via Q-Gabon
- **Suivi d'impact** - Visualisez votre impact écologique (CO₂ évité)
- **Favoris** - Sauvegardez vos commerces et produits préférés
- **Notifications** - Recevez des alertes pour les nouveaux produits
- **Historique transactions** - Consultez vos paiements et économies

### Pour les Commerçants

- **Gestion produits** - Ajoutez et gérez vos invendus facilement
- **Gestion produits** - Ajoutez et gérez vos invendus facilement
- **Statistiques** - Suivez vos ventes et votre impact
- **Gestion revenus** - Tableau de bord financier complet
- **Gestion clients** - Suivez vos réservations en temps réel
- **Transactions** - Historique détaillé de tous les paiements

### Pour les Administrateurs

- **Dashboard central** - Vue d'ensemble de la plateforme
- **Dashboard central** - Vue d'ensemble de la plateforme
- **Gestion utilisateurs** - Modération et support
- **Validation commerces** - Approbation des nouveaux partenaires
- **Suivi paiements** - Monitoring des transactions Q-Gabon
- **Analytics** - Statistiques globales et rapports

## Architecture

```text
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Next.js   │────▶│   Supabase   │────▶│  PostgreSQL │
│  Frontend   │     │   Backend    │     │  Database   │
└─────────────┘     └──────────────┘     └─────────────┘
       │                    │
       │                    ▼
       │            ┌──────────────┐
       │            │ Edge Functions│
       │            │  (Deno)      │
       │            └──────────────┘
       │                    │
       ▼                    ▼
┌─────────────┐     ┌──────────────┐
│   Vercel    │     │   Q-Gabon    │
│  Hosting    │     │  Payment API │
└─────────────┘     └──────────────┘
```

### Stack Technique

#### Frontend

- Next.js 15 (App Router)
- React 18 + TypeScript
- Tailwind CSS + shadcn/ui
- Framer Motion (animations)
- React Query (state management)

#### Backend

- Supabase (BaaS)
- PostgreSQL (database)
- Row Level Security (RLS)
- Realtime subscriptions
- Edge Functions (Deno)

#### Services

- Q-Gabon API (Airtel Money)
- Vercel (hosting)
- MapLibre GL (maps)

## Prérequis

- Node.js 18+ ([installer](https://nodejs.org/))
- npm ou yarn ou bun
- Compte Supabase ([créer](https://supabase.com/))
- Compte Q-Gabon ([contact](https://www.pvit-gabon.com/))
- Git

## Installation

### 1. Cloner le dépôt

```bash
git clone https://github.com/Kedesh11/ouyaboung.git
cd ouyaboung
```

### 2. Installer les dépendances

```bash
npm install
# ou
yarn install
# ou
bun install
```

### 3. Installer Supabase CLI

```bash
npm install supabase --save-dev
# ou
npx supabase init
```

## Configuration

### 1. Variables d'environnement

Créer `.env.local` à partir de `.env.example` :

```bash
cp .env.example .env.local
```

Remplir avec vos valeurs :

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://votreprojet.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=votre_cle_anon

# Production
NEXT_PUBLIC_SITE_URL=https://votre-domaine.com
```

### 2. Secrets Supabase (Edge Functions)

```bash
# Q-Gabon API
npx supabase secrets set BEAR_TOKEN=votre_bearer_token
npx supabase secrets set ACCOUNT_CODE=votre_account_code
npx supabase secrets set AGENT=votre_agent_id
```

### 3. Base de données

Exécuter les migrations :

```bash
npx supabase db push
```

Ou manuellement :

```bash
npx supabase migration up
```

### 4. Déployer les Edge Functions

```bash
npx supabase functions deploy initiate-payment --no-verify-jwt
npx supabase functions deploy payment-callback --no-verify-jwt
```

## Démarrage

### Mode Développement

```bash
npm run dev
```

Ouvrir [http://localhost:3000](http://localhost:3000)

### Mode Production

```bash
npm run build
npm start
```

### Commandes de test

```bash
# Tests unitaires
npm run test:unit

# Tests avec coverage
npm run test:coverage

# Mode watch
npm run test:watch

# UI interactive
npm run test:ui
```

## Structure du Projet

```text
ouyaboung/
├── app/                      # Next.js App Router
│   ├── (public)/            # Routes publiques
│   │   ├── page.tsx         # Landing page
│   │   └── search/          # Recherche produits
│   ├── (dashboard)/         # Routes protégées
│   │   ├── user/            # Dashboard utilisateur
│   │   ├── merchant/        # Dashboard commerçant
│   │   └── admin/           # Dashboard admin
│   ├── auth/                # Authentification
│   └── _components/         # Composants layout
│
├── src/
│   ├── components/          # Composants réutilisables
│   │   ├── ui/             # shadcn/ui components
│   │   └── payment/        # PaymentModal
│   │
│   ├── lib/                # Utilitaires
│   │   ├── payment-fees.ts # Calcul frais 3%/3%/3%
│   │   └── phone-validation.ts # Validation Airtel
│   │
│   ├── services/           # Business logic
│   │   ├── payment.service.ts
│   │   ├── orders.service.ts
│   │   └── impact.service.ts
│   │
│   ├── api/                # Supabase API calls
│   ├── hooks/              # React hooks
│   ├── types/              # TypeScript types
│   └── utils/              # Helpers
│
├── supabase/
│   ├── functions/          # Edge Functions (Deno)
│   │   ├── initiate-payment/
│   │   └── payment-callback/
│   └── migrations/         # SQL migrations
│
└── public/                 # Assets statiques
```

## Paiement Mobile

### Flux de Paiement Airtel Money

1. **Utilisateur** : Sélectionne un produit et clique "Payer"
2. **Frontend** : Affiche `PaymentModal` avec calcul des frais
3. **Edge Function** : `initiate-payment` appelle Q-Gabon API
4. **Q-Gabon** : Envoie USSD Push au téléphone Airtel
5. **Utilisateur** : Entre son PIN et valide
6. **Callback** : Q-Gabon notifie `payment-callback`
7. **Database** : Transaction mise à jour, commande confirmée
8. **Realtime** : UI mise à jour automatiquement

### Structure des Frais (9% total)

- **3% Airtel** - Frais opérateur
- **3% PVIT** - Frais plateforme Q-Gabon
- **3% App** - Frais plateforme Ouyaboung

**Exemple** : Produit à 1000 XAF

- Base : 1000 XAF
- Frais Airtel : 30 XAF
- Frais PVIT : 30 XAF
- Frais App : 30 XAF
- **Total payé** : 1090 XAF
- **Revenu commerce** : 1000 XAF

### Configuration Webhook

Configurer dans le dashboard Q-Gabon :

```text
URL: https://geqvbpghvmcglzfkqmvj.supabase.co/functions/v1/payment-callback
Method: POST
Format: JSON
```

## Déploiement

### Vercel (Recommandé)

1. **Connecter à Vercel**

```bash
npm install -g vercel
vercel login
vercel
```

1. **Variables d'environnement**

```bash
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
```

1. **Déployer**

```bash
vercel --prod
```

### Configuration DNS

Ajouter les enregistrements :

```text
A     @     76.76.21.21
CNAME www   cname.vercel-dns.com
```

## Tests

### Tests Unitaires

```bash
npm run test:unit
```

### Tests E2E (Paiement)

```bash
# 1. Créer une transaction test
npm run test:payment

# 2. Vérifier avec Postman
curl -X POST https://...supabase.co/functions/v1/payment-callback \
  -H "Content-Type: application/json" \
  -d '{
    "success": true,
    "reference": "REF_TEST_123",
    "data": {
      "status": "SUCCESS",
      "operator": "AIRTEL_MONEY"
    }
  }'
```

## Contribution

Les contributions sont bienvenues !

1. Fork le projet
2. Créer une branche (`git checkout -b feature/AmazingFeature`)
3. Commit vos changements (`git commit -m 'Add AmazingFeature'`)
4. Push vers la branche (`git push origin feature/AmazingFeature`)
5. Ouvrir une Pull Request

### Standards de Code

- TypeScript strict mode
- ESLint + Prettier
- Conventional Commits
- Tests unitaires requis

## Intégration API de Paiement

### Vue d'Ensemble

Le système de paiement mobile utilise **Q-Gabon API** pour les transactions Airtel Money et Moov Money. Cette section documente l'intégration complète pour faciliter l'ajout de nouveaux opérateurs.

### Architecture Paiement

```text
User → PaymentModal → payment.service.ts → Edge Function → Q-Gabon API
                                                    ↓
                                            Supabase DB (transactions)
                                                    ↓
                                            Webhook Callback ← Q-Gabon
                                                    ↓
                                            Realtime Update → User
```

### Spécifications API Q-Gabon

#### Endpoint: Initiation Paiement

**URL**: `https://payment.q-gabon.com/payment`  
**Méthode**: `POST`  
**Auth**: Bearer Token (Header)

**Request**:

```json
{
  "phone": "077157904",           // Format: 9 chiffres
  "accountCode": "ACC_xxxxx",     // Votre code compte
  "product": "paiement",          // Nom produit
  "amount": 3052,                 // Montant TOTAL (base + frais)
  "agent": "Ned"                  // Identifiant agent
}
```

**Response Success**:

```json
{
  "success": true,
  "reference": "REF_1234567890",
  "data": {
    "transactionId": "TXN_ABC123",
    "merchantReferenceId": "MER_XYZ789",
    "customerID": "077157904",
    "amount": 2800,
    "operator": "AIRTEL_MONEY",    // ou MOOV_MONEY
    "status": "PENDING",
    "totalAmount": 3052,
    "fees": 252,
    "code": 200,
    "message": "Paiement initié avec succès"
  }
}
```

**Response Error**:

```json
{
  "success": false,
  "reference": null,
  "data": {
    "status": "FAILED",
    "code": 400,
    "message": "Numéro de téléphone invalide"
  }
}
```

#### Webhook: Callback Confirmation

**URL**: Configurée chez Q-Gabon  
**Méthode**: `POST`  
**Format**: JSON

**Payload**:

```json
{
  "success": true,
  "reference": "REF_1234567890",
  "data": {
    "status": "SUCCESS",          // SUCCESS | FAILED | TIMEOUT
    "operator": "AIRTEL_MONEY",
    "reference_id": "TXN_ABC123",
    "merchant_reference_id": "MER_XYZ789",
    "status_code": "0",
    "message": "Paiement validé"
  }
}
```

### Validation Numéros

#### Airtel Money (Gabon)

- **Format**: 9 chiffres exactement
- **Préfixes**: `074`, `076`, `077`, `74`, `76`, `77`
- **Exemples valides**: `074123456`, `77157904`, `07 61 23 45 67`
- **Exemples invalides**: `071234567` (Moov), `0741234` (trop court)

#### Moov Money (Gabon) - À Implémenter

- **Format**: 9 chiffres exactement
- **Préfixes**: `061`, `062`, `065`, `066`, `61`, `62`, `65`, `66`
- **Exemples valides**: `061234567`, `62053671`

### Bibliothèques Réutilisables

#### 1. Calcul des Frais

**Fichier**: `src/lib/payment-fees.ts`

```typescript
export interface PaymentFees {
  baseAmount: number;
  airtelFees: number;      // 3%
  pvitFees: number;        // 3%
  appFees: number;         // 3%
  totalFees: number;
  finalAmount: number;
}

export function calculatePaymentFees(baseAmount: number): PaymentFees {
  const airtelFees = Math.round(baseAmount * 0.03);
  const pvitFees = Math.round(baseAmount * 0.03);
  const appFees = Math.round(baseAmount * 0.03);
  
  return {
    baseAmount,
    airtelFees,
    pvitFees,
    appFees,
    totalFees: airtelFees + pvitFees + appFees,
    finalAmount: baseAmount + airtelFees + pvitFees + appFees
  };
}
```

**Exemple**:

```typescript
const fees = calculatePaymentFees(1000);
// → { baseAmount: 1000, airtelFees: 30, pvitFees: 30, appFees: 30, totalFees: 90, finalAmount: 1090 }
```

#### 2. Validation Téléphone

**Fichier**: `src/lib/phone-validation.ts`

```typescript
// Airtel
export function validateAirtelPhone(phone: string): boolean {
  const cleaned = phone.replace(/\s+/g, '');
  if (!/^\d{9}$/.test(cleaned)) return false;
  return ['074', '076', '077', '74', '76', '77'].some(p => cleaned.startsWith(p));
}

// Moov (à implémenter)
export function validateMoovPhone(phone: string): boolean {
  const cleaned = phone.replace(/\s+/g, '');
  if (!/^\d{9}$/.test(cleaned)) return false;
  return ['061', '062', '065', '066', '61', '62', '65', '66'].some(p => cleaned.startsWith(p));
}

export function normalizePhone(phone: string): string {
  return phone.replace(/\s+/g, '');
}

export function formatPhone(phone: string): string {
  const cleaned = phone.replace(/\s+/g, '');
  return `${cleaned.slice(0, 2)} ${cleaned.slice(2, 4)} ${cleaned.slice(4, 6)} ${cleaned.slice(6, 8)} ${cleaned.slice(8)}`;
}
```

### Edge Functions

#### 1. initiate-payment

**Path**: `supabase/functions/initiate-payment/index.ts`  
**URL**: `https://[PROJECT].supabase.co/functions/v1/initiate-payment`

**Flux**:

1. Authentification JWT
2. Validation order ownership
3. Calcul des frais
4. Appel Q-Gabon API
5. Insertion transaction DB
6. Retour résultat

**Appel depuis Frontend**:

```typescript
const { data: { session } } = await supabase.auth.getSession();

const response = await fetch(
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/initiate-payment`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`
    },
    body: JSON.stringify({
      orderId,
      phone: '077157904',
      baseAmount: 1000
    })
  }
);
```

#### 2. payment-callback

**Path**: `supabase/functions/payment-callback/index.ts`  
**URL**: `https://[PROJECT].supabase.co/functions/v1/payment-callback`

**Flux**:

1. Réception webhook Q-Gabon
2. Recherche transaction par référence
3. Mise à jour statut
4. Auto-confirmation commande (si SUCCESS)
5. Notification Realtime

**Configuration Webhook**:

- URL: `https://geqvbpghvmcglzfkqmvj.supabase.co/functions/v1/payment-callback`
- Méthode: POST
- Format: JSON

### Schéma Database

#### Table: transactions

```sql
CREATE TABLE transactions (
  id UUID PRIMARY KEY,
  order_id UUID REFERENCES orders(id),
  user_id UUID REFERENCES auth.users(id),
  merchant_id UUID REFERENCES merchants(id),
  
  phone TEXT NOT NULL,
  amount INTEGER NOT NULL,           -- Base
  airtel_fees INTEGER NOT NULL,      -- 3%
  pvit_fees INTEGER NOT NULL,        -- 3%
  app_fees INTEGER NOT NULL,         -- 3%
  total_amount INTEGER NOT NULL,     -- Total
  
  reference TEXT UNIQUE,             -- Q-Gabon ref
  transaction_id TEXT,               -- Q-Gabon transaction ID
  operator TEXT,                     -- AIRTEL_MONEY | MOOV_MONEY
  status TEXT CHECK (status IN ('PENDING','SUCCESS','FAILED','CANCELLED','TIMEOUT')),
  
  q_gabon_response JSONB,            -- Réponse brute
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
```

#### Vue: merchant_transactions

Join complet transaction → order → product → merchant → customer pour dashboards.

### Service Frontend

**Fichier**: `src/services/payment.service.ts`

```typescript
interface PaymentInitiationRequest {
  phone: string;
  orderId: string;
  baseAmount: number;
}

export async function initiateAirtelPayment(
  request: PaymentInitiationRequest
): Promise<ApiResponse<PaymentInitiationResponse>> {
  // 1. Validation téléphone
  if (!validateAirtelPhone(request.phone)) {
    return { success: false, error: { message: 'Numéro Airtel invalide' } };
  }
  
  // 2. Calcul frais
  const fees = calculatePaymentFees(request.baseAmount);
  
  // 3. Appel Edge Function
  const { data: { session } } = await supabase.auth.getSession();
  
  const response = await supabase.functions.invoke('initiate-payment', {
    body: {
      orderId: request.orderId,
      phone: normalizePhone(request.phone),
      baseAmount: request.baseAmount
    },
    headers: {
      Authorization: `Bearer ${session?.access_token}`
    }
  });
  
  return response;
}
```

### Composant Payment Modal

**Fichier**: `src/components/payment/PaymentModal.tsx`

```tsx
interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  amount: number;        // Montant de base
  orderId: string;
  onSuccess: (transactionId: string) => void;
}

export function PaymentModal({ amount, orderId, onSuccess }: PaymentModalProps) {
  const [phone, setPhone] = useState('');
  const fees = calculatePaymentFees(amount);
  
  const handlePay = async () => {
    const result = await initiateAirtelPayment({
      phone,
      orderId,
      baseAmount: amount
    });
    
    if (result.success) {
      onSuccess(result.data.transactionId);
    }
  };
  
  return (
    <Dialog open={isOpen}>
      <Input 
        placeholder="07x xx xx xx x"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
      />
      <div>
        <p>Montant: {amount} XAF</p>
        <p>Frais: {fees.totalFees} XAF</p>
        <p>Total: {fees.finalAmount} XAF</p>
      </div>
      <Button onClick={handlePay}>Payer</Button>
    </Dialog>
  );
}
```

### Guide d'Implémentation Moov Money

Pour ajouter Moov Money, suivre ces étapes :

1. **Validation** : Créer `validateMoovPhone()` dans `phone-validation.ts`
2. **Service** : Créer `initiateMoovPayment()` dans `payment.service.ts`
3. **Edge Function** : Adapter `initiate-payment` pour détecter l'opérateur
4. **Q-Gabon** : Vérifier que l'API supporte Moov (même endpoint)
5. **Modal** : Ajouter sélection opérateur dans `PaymentModal`
6. **Tests** : Tester avec numéro Moov réel

**Détection automatique opérateur**:

```typescript
export function detectOperator(phone: string): 'AIRTEL' | 'MOOV' | null {
  if (validateAirtelPhone(phone)) return 'AIRTEL';
  if (validateMoovPhone(phone)) return 'MOOV';
  return null;
}
```

### Documentation Complète

Voir [`INTEGRATION_PAIEMENT.md`](file:///home/sevan/.gemini/antigravity/brain/2edab6ae-4eba-4c79-83a9-a15b150e4d30/INTEGRATION_PAIEMENT.md) pour :

- Diagrammes de séquence détaillés
- Tests unitaires recommandés
- Troubleshooting complet
- Monitoring et logging
- Exemples curl pour tests

## �License

Ce projet est sous licence MIT. Voir [LICENSE](LICENSE) pour plus de détails.

## Contact & Support

- **Email** : [ouyaboung@gmail.com](mailto:ouyaboung@gmail.com)
- **GitHub Issues** : [Créer un ticket](https://github.com/Kedesh11/ouyaboung/issues)
- **Documentation** : [docs/](docs/)

---

**© 2026 Ifumb. Tous droits réservés.**
