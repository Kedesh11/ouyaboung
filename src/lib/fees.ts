// Affichage des frais (les montants sont toujours calcules cote serveur).

import type { FeeBreakdown, FeeOperator } from '@/api/fees.api';

/** 0.025 -> "2,5 %", 0.1 -> "10 %". */
export const formatPercent = (rate: number): string => {
  const percent = Math.round(rate * 10_000) / 100;
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(percent)} %`;
};

/** 11385 -> "11 385 FCFA". */
export const formatXaf = (amount: number | null | undefined): string =>
  amount == null ? '—' : `${new Intl.NumberFormat('fr-FR').format(amount).replace(/[\u202f\u00a0]/g, ' ')} FCFA`;

export const operatorLabel = (operator: FeeOperator): string => (operator === 'airtel' ? 'Airtel Money' : 'Moov Money');

/** Le champ du reglage correspondant a un taux, pour l'affichage de l'historique. */
export const FEE_FIELD_LABEL: Record<string, string> = {
  order_commission_rate: 'Commission sur les commandes',
  transport_commission_rate: 'Commission sur les transports',
  pvit_fee_rate: 'Frais PVIT',
  airtel_fee_rate: 'Frais Airtel Money',
  moov_fee_rate: 'Frais Moov Money',
};

// ---------------------------------------------------------------------------
// Apercu admin: meme formule que compute_fee_breakdown() en base (commission arrondie au plus
// proche, frais PVIT et operateur arrondis a l'entier superieur, calcules sur prix + commission).
// Arithmetique entiere sur des dix-milliemes: aucune derive de virgule flottante. Le montant
// reellement facture est toujours calcule par le serveur; ceci ne sert qu'a visualiser un reglage
// avant de l'enregistrer (les tests sont epingles aux memes exemples que les tests SQL).
// ---------------------------------------------------------------------------
import type { FeeFlow, FeeSettingsInput } from '@/api/fees.api';

const toTenThousandths = (rate: number): number => Math.round(rate * 10_000);

export interface FeePreview {
  base: number;
  platform: number;
  pvit: number;
  operator: number;
  total: number;
}

export const previewFeeBreakdown = (
  rates: FeeSettingsInput,
  flow: FeeFlow,
  baseAmount: number,
  operator: FeeOperator,
): FeePreview => {
  const platformRate = toTenThousandths(flow === 'order' ? rates.order_commission_rate : rates.transport_commission_rate);
  const operatorRate = toTenThousandths(operator === 'airtel' ? rates.airtel_fee_rate : rates.moov_fee_rate);
  const platform = Math.floor((baseAmount * platformRate + 5_000) / 10_000);
  const subtotal = baseAmount + platform;
  const ceilShare = (rate: number) => Math.floor((subtotal * rate + 9_999) / 10_000);
  const pvit = ceilShare(toTenThousandths(rates.pvit_fee_rate));
  const op = ceilShare(operatorRate);
  return { base: baseAmount, platform, pvit, operator: op, total: baseAmount + platform + pvit + op };
};

// ---------------------------------------------------------------------------
// Detail d'une transaction deja payee, pour l'historique du payeur.
// Le detail fige au paiement (fee_breakdown) fait foi; a defaut (anciens paiements) on le
// reconstitue des colonnes de la transaction, sans taux.
// ---------------------------------------------------------------------------
export interface TransactionFeeRow {
  fee_breakdown?: FeeBreakdown | null;
  operator?: string | null;
  base_amount?: number | null;
  app_fees?: number | null;
  pvit_fees?: number | null;
  airtel_fees?: number | null;
  total_amount?: number | null;
}

export const transactionBreakdown = (row: TransactionFeeRow): Omit<FeeBreakdown, 'rates'> & { rates?: FeeBreakdown['rates'] } | null => {
  if (row.fee_breakdown) return row.fee_breakdown;
  const base = Number(row.base_amount);
  const total = Number(row.total_amount);
  if (!Number.isFinite(base) || !Number.isFinite(total) || total <= 0) return null;
  return {
    flow: 'order',
    operator: /moov/i.test(row.operator ?? '') ? 'moov' : 'airtel',
    base_amount: base,
    recipient_amount: base,
    platform_fee: Number(row.app_fees) || 0,
    pvit_fee: Number(row.pvit_fees) || 0,
    operator_fee: Number(row.airtel_fees) || 0,
    total_amount: total,
    fees_estimated: true,
    currency: 'XAF',
  };
};
